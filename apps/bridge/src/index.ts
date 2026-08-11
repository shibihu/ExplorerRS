import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { parseMessage } from "@explorerrs/shared";

const PORT = 8080;
const webClients = new Set<WebSocket>();

// Queue for property updates from Web UI
let pendingUpdates: Array<{ id: string; property: string; value: any }> = [];

// Latest selection update from Web UI
let pendingSelection: string | null = null;

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Endpoint: Receive hierarchy/changes from Roblox
  if (req.url === "/api/sync" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);

        if (!payload || typeof payload !== "object") {
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

        // Respond with queued property updates and selection changes
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            updates: pendingUpdates,
            selection: pendingSelection,
          })
        );

        // Clear local queues
        pendingUpdates = [];
        pendingSelection = null;
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  // 2. Endpoint: Queue property edit from Web UI
  if (req.url === "/api/update-property" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body); // { id, property, value }

        if (
          !payload ||
          typeof payload !== "object" ||
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

        pendingUpdates.push(payload);
        console.log("[Bridge] Queued property update:", payload);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "queued" }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("[Bridge] New Web Client Connected");
  webClients.add(ws);

  ws.on("message", (messageData) => {
    try {
      const parsed = parseMessage(messageData.toString());
      if (parsed) {
        if (parsed.type === "selection.change") {
          const payload = parsed.payload as { instanceId: string } | undefined;
          if (payload && typeof payload.instanceId === "string") {
            console.log("[Bridge] Selection change queued:", payload.instanceId);
            pendingSelection = payload.instanceId;
          }
        }
      }
    } catch (err) {
      console.error("[Bridge] Error handling web client message:", err);
    }
  });

  ws.on("close", () => {
    webClients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`[Bridge Server] Running on http://localhost:${PORT}`);
});
