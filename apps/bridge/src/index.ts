import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { parseMessage } from "@explorerrs/shared";

const PORT = 8080;

const webClients = new Set<WebSocket>();
let robloxClient: WebSocket | null = null;

// Queue for property updates from Web UI (consumed by Roblox poller / WS relay)
let pendingUpdates: Array<{ id: string; property: string; value: any }> = [];

// Queue for instance actions (create/delete/move) from Web UI
let pendingActions: Array<Record<string, any>> = [];

// Latest selection update from Web UI
let pendingSelection: string | null = null;

// Small helper to parse a JSON request body into an object
function readBody(
  req: http.IncomingMessage
): Promise<Record<string, any> | null> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === "object") {
          resolve(parsed);
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });
  });
}

// Relay an action to the Roblox plugin over WebSocket when it is connected
function relayActionToRoblox(action: Record<string, any>) {
  if (robloxClient && robloxClient.readyState === WebSocket.OPEN) {
    robloxClient.send(
      JSON.stringify({
        type: "instance.action",
        payload: action,
      })
    );
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Endpoint: Receive hierarchy/changes from Roblox (HTTP Polling Fallback)
  if (req.url === "/api/sync" && req.method === "POST") {
    const payload = await readBody(req);

    if (!payload) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid payload format" }));
      return;
    }

    // Broadcast non-poll messages to connected web clients
    if (payload.type !== "poll") {
      webClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(payload));
        }
      });
    }

    // Respond with queued property updates, instance actions, and selection
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        updates: pendingUpdates,
        actions: pendingActions,
        selection: pendingSelection,
      })
    );

    if (pendingUpdates.length > 0 || pendingActions.length > 0) {
      console.log(
        `[Bridge] Handed ${pendingUpdates.length} update(s) and ${pendingActions.length} action(s) to Roblox poller`
      );
    }

    // Clear local queues
    pendingUpdates = [];
    pendingActions = [];
    pendingSelection = null;
    return;
  }

  // 2. Endpoint: Queue property edit from Web UI
  if (req.url === "/api/update-property" && req.method === "POST") {
    const payload = await readBody(req);

    if (
      !payload ||
      typeof payload.id !== "string" ||
      typeof payload.property !== "string"
    ) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Missing or invalid fields: id, property, value",
        })
      );
      return;
    }

    pendingUpdates.push({
      id: payload.id,
      property: payload.property,
      value: payload.value,
    });
    console.log("[Bridge] Queued property update:", payload);

    // Relay via WebSocket directly to Roblox if connected
    if (robloxClient && robloxClient.readyState === WebSocket.OPEN) {
      robloxClient.send(
        JSON.stringify({
          type: "property.update",
          payload,
        })
      );
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "queued" }));
    return;
  }

  // 3. Endpoint: Queue instance creation from Web UI
  if (req.url === "/api/create-instance" && req.method === "POST") {
    const payload = await readBody(req);

    if (
      !payload ||
      typeof payload.parentId !== "string" ||
      typeof payload.className !== "string" ||
      payload.className.trim() === ""
    ) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Missing or invalid fields: parentId, className",
        })
      );
      return;
    }

    const action = {
      type: "create",
      parentId: payload.parentId,
      className: payload.className,
      name:
        typeof payload.name === "string" && payload.name.trim() !== ""
          ? payload.name
          : `New${payload.className}`,
    };

    pendingActions.push(action);
    console.log("[Bridge] Queued create-instance action:", action);
    relayActionToRoblox(action);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "queued", action }));
    return;
  }

  // 4. Endpoint: Queue instance deletion from Web UI
  if (req.url === "/api/delete-instance" && req.method === "POST") {
    const payload = await readBody(req);

    if (!payload || typeof payload.id !== "string" || payload.id.trim() === "") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Missing or invalid field: id",
        })
      );
      return;
    }

    const action = { type: "delete", instanceId: payload.id };

    pendingActions.push(action);
    console.log("[Bridge] Queued delete-instance action:", action);
    relayActionToRoblox(action);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "queued", action }));
    return;
  }

  // 5. Endpoint: Queue a batch of hierarchy changes (used by Restore Snapshot)
  if (req.url === "/api/apply-changes" && req.method === "POST") {
    const payload = await readBody(req);

    if (!payload || !Array.isArray(payload.changes)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Missing or invalid field: changes (must be an array)",
        })
      );
      return;
    }

    let queuedUpdates = 0;
    let queuedActions = 0;
    const newActions: Array<Record<string, any>> = [];

    for (const change of payload.changes) {
      if (!change || typeof change !== "object" || typeof change.type !== "string") {
        continue;
      }
      if (change.type === "create" || change.type === "delete" || change.type === "move") {
        pendingActions.push(change);
        newActions.push(change);
        queuedActions++;
      } else if (change.type === "rename") {
        if (typeof change.instanceId === "string") {
          pendingUpdates.push({
            id: change.instanceId,
            property: "Name",
            value: change.newName,
          });
          queuedUpdates++;
        }
      } else if (change.type === "update-property") {
        if (typeof change.instanceId === "string" && typeof change.property === "string") {
          pendingUpdates.push({
            id: change.instanceId,
            property: change.property,
            value: change.value,
          });
          queuedUpdates++;
        }
      }
    }

    console.log(
      `[Bridge] Queued ${queuedActions} action(s) and ${queuedUpdates} update(s) via /api/apply-changes`
    );

    // Relay the newly queued actions to Roblox over WebSocket when connected
    for (const action of newActions) {
      relayActionToRoblox(action);
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "queued",
        queuedActions,
        queuedUpdates,
      })
    );
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  console.log(`[Bridge] New WebSocket Connection from ${req.socket.remoteAddress}`);

  ws.on("message", (messageData) => {
    const rawMsg = messageData.toString();
    try {
      let parsed: any = parseMessage(rawMsg);
      if (!parsed) {
        parsed = JSON.parse(rawMsg);
      }

      if (parsed) {
        // Handshake Registration
        if (parsed.type === "connection.hello") {
          if (parsed.role === "web") {
            webClients.add(ws);
            console.log("[Bridge] Registered Web Client");
          } else if (parsed.role === "roblox") {
            robloxClient = ws;
            console.log("[Bridge] Registered Roblox Studio Plugin");
          }

          ws.send(
            JSON.stringify({
              type: "connection.ready",
              status: "connected",
              timestamp: Date.now(),
            })
          );
          return;
        }

        // Selection Change Handling
        if (parsed.type === "selection.change") {
          const payload = parsed.payload as { instanceId: string } | undefined;
          if (payload && typeof payload.instanceId === "string") {
            console.log("[Bridge] Selection change queued:", payload.instanceId);
            pendingSelection = payload.instanceId;
          }
        }

        // Full Hierarchy Sync from Web -> Roblox Studio
        if (parsed.type === "hierarchy.sync_from_web") {
          console.log("[Bridge] Relaying Hierarchy Sync from Web to Roblox Studio");
          if (robloxClient && robloxClient.readyState === WebSocket.OPEN) {
            robloxClient.send(rawMsg);
          }
        }

        // Relay messages between Web and Roblox Plugin
        if (webClients.has(ws)) {
          if (robloxClient && robloxClient.readyState === WebSocket.OPEN) {
            robloxClient.send(rawMsg);
          }
        } else if (ws === robloxClient) {
          webClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(rawMsg);
            }
          });
        }
      }
    } catch (err) {
      console.error("[Bridge] Error handling WebSocket message:", err);
    }
  });

  ws.on("close", () => {
    if (webClients.has(ws)) {
      webClients.delete(ws);
      console.log("[Bridge] Web Client disconnected");
    } else if (ws === robloxClient) {
      robloxClient = null;
      console.log("[Bridge] Roblox Plugin disconnected");
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Bridge Server] Running on http://localhost:${PORT}`);
});
