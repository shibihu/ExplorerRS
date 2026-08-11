import { useEffect, useState, useRef } from "react";
import { parseMessage } from "@explorerrs/shared";
import "./App.css";

interface InstanceNode {
  id: string;
  name: string;
  className: string;
  properties?: Record<string, any>;
  children?: InstanceNode[];
}

const CLASS_ICONS: Record<string, string> = {
  Workspace: "🌐",
  Camera: "🎥",
  Part: "🧊",
  SpawnLocation: "🚩",
  Model: "📦",
  Folder: "📁",
};

function TreeNode({
  node,
  selectedId,
  onSelectNode,
}: {
  node: InstanceNode;
  selectedId: string | null;
  onSelectNode: (node: InstanceNode) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;
  const icon = CLASS_ICONS[node.className] || "📄";

  return (
    <div style={{ marginLeft: "14px", textAlign: "left" }}>
      <div
        onClick={() => onSelectNode(node)}
        style={{
          cursor: "pointer",
          userSelect: "none",
          padding: "3px 8px",
          borderRadius: "4px",
          backgroundColor: isSelected ? "#0284c7" : "transparent",
          color: isSelected ? "#fff" : "#e2e8f0",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          style={{ width: "12px", fontSize: "10px", color: "#94a3b8" }}
        >
          {hasChildren ? (isOpen ? "▼" : "►") : ""}
        </span>
        <span>{icon}</span>
        <strong>{node.name}</strong>
        <span
          style={{
            color: isSelected ? "#e0f2fe" : "#64748b",
            fontSize: "0.8em",
          }}
        >
          ({node.className})
        </span>
      </div>

      {isOpen && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id || child.name}
              node={child}
              selectedId={selectedId}
              onSelectNode={onSelectNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Tree Mutator and Helper Functions
function deepClone(node: InstanceNode): InstanceNode {
  return {
    ...node,
    properties: node.properties ? { ...node.properties } : undefined,
    children: node.children ? node.children.map(deepClone) : [],
  };
}

function findNode(node: InstanceNode, id: string): InstanceNode | null {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

function removeNode(node: InstanceNode, id: string): InstanceNode | null {
  if (node.children) {
    const index = node.children.findIndex((child) => child.id === id);
    if (index !== -1) {
      return node.children.splice(index, 1)[0];
    }
    for (const child of node.children) {
      const removed = removeNode(child, id);
      if (removed) return removed;
    }
  }
  return null;
}

function applyChanges(root: InstanceNode, changes: any[]): InstanceNode {
  const cloned = deepClone(root);
  for (const change of changes) {
    try {
      if (change.type === "rename") {
        const target = findNode(cloned, change.instanceId);
        if (target) {
          target.name = change.newName;
        }
      } else if (change.type === "delete") {
        removeNode(cloned, change.instanceId);
      } else if (change.type === "create") {
        const parent = findNode(cloned, change.parentId);
        if (parent) {
          if (!parent.children) parent.children = [];
          const exists = parent.children.some(
            (c) => c.id === change.instanceId
          );
          if (!exists) {
            parent.children.push({
              id: change.instanceId || `${change.name}-${Date.now()}`,
              name: change.name,
              className: change.className,
              children: [],
            });
          }
        }
      } else if (change.type === "move") {
        const nodeToMove = removeNode(cloned, change.instanceId);
        if (nodeToMove) {
          const newParent = findNode(cloned, change.newParentId);
          if (newParent) {
            if (!newParent.children) newParent.children = [];
            newParent.children.push(nodeToMove);
          }
        }
      } else if (change.type === "update-property") {
        const target = findNode(cloned, change.instanceId);
        if (target) {
          if (!target.properties) target.properties = {};
          target.properties[change.property] = change.value;
          if (change.property === "Name") {
            target.name = String(change.value);
          }
        }
      }
    } catch (e) {
      console.error("[Web] Error applying individual change:", change, e);
    }
  }
  return cloned;
}

export function App() {
  const [connected, setConnected] = useState(false);
  const [treeData, setTreeData] = useState<InstanceNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<InstanceNode | null>(null);
  const [editName, setEditName] = useState("");

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const hostname = window.location.hostname;
    const wsUrl = hostname.includes("github.dev")
      ? `wss://${hostname.replace(
          /-\d+\.app\.github\.dev$/,
          "-8080.app.github.dev"
        )}`
      : "ws://localhost:8080";

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      try {
        ws.send(JSON.stringify({ type: "connection.hello", role: "web" }));
      } catch (err) {
        console.error("Error sending hello message:", err);
      }
    };

    ws.onmessage = (event) => {
      try {
        let parsed: any = parseMessage(event.data.toString());
        if (!parsed) {
          // Fallback parsing for backward compatibility or direct structures
          parsed = JSON.parse(event.data.toString());
        }

        if (!parsed) return;

        if (parsed.type === "hierarchy.full") {
          const data = parsed.data;
          if (data && data.Workspace) {
            setTreeData(data.Workspace);
          }
        } else if (parsed.type === "changes.apply") {
          const payload = parsed.payload;
          if (
            payload &&
            payload.changeSet &&
            Array.isArray(payload.changeSet.changes)
          ) {
            setTreeData((prevTree) => {
              if (!prevTree) return prevTree;
              const nextTree = applyChanges(prevTree, payload.changeSet.changes);

              // Update selected node state to avoid stale details
              if (selectedNode) {
                const updatedSelected = findNode(nextTree, selectedNode.id);
                if (updatedSelected) {
                  setSelectedNode(updatedSelected);
                  setEditName(updatedSelected.name);
                } else {
                  setSelectedNode(null);
                  setEditName("");
                }
              }

              return nextTree;
            });
          }
        }
      } catch (err) {
        console.error("Error parsing/processing WS message:", err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };

    return () => {
      ws.close();
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, [selectedNode]);

  // Sync selection with bridge
  const handleSelectNode = (node: InstanceNode) => {
    setSelectedNode(node);
    setEditName(node.name);

    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "selection.change",
            protocolVersion: 1,
            payload: {
              instanceId: node.id,
            },
          })
        );
      }
    } catch (err) {
      console.error("Error sending selection change to bridge:", err);
    }
  };

  // Sync property updates with bridge
  const handleUpdateProperty = async (property: string, value: any) => {
    if (!selectedNode) return;

    try {
      const updateUrl = window.location.hostname.includes("github.dev")
        ? `https://${window.location.hostname.replace(
            /-\d+\.app\.github\.dev$/,
            "-8080.app.github.dev"
          )}/api/update-property`
        : "http://localhost:8080/api/update-property";

      const res = await fetch(updateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedNode.id,
          property,
          value,
        }),
      });

      if (!res.ok) {
        console.error("Failed to queue property update:", await res.text());
      }
    } catch (err) {
      console.error("Error performing property update request:", err);
    }
  };

  return (
    <div
      style={{
        padding: "20px",
        fontFamily: "sans-serif",
        backgroundColor: "#0f172a",
        minHeight: "100vh",
        color: "#f8fafc",
      }}
    >
      <h2 style={{ margin: "0 0 10px 0" }}>ExplorerRS - Two-Way Sync</h2>
      <div style={{ marginBottom: "15px", fontSize: "0.9em" }}>
        Status:{" "}
        <span
          style={{
            color: connected ? "#22c55e" : "#ef4444",
            fontWeight: "bold",
          }}
        >
          {connected ? "Connected to Bridge" : "Disconnected"}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: "15px",
        }}
      >
        {/* Left: Tree */}
        <div
          style={{
            border: "1px solid #334155",
            borderRadius: "8px",
            padding: "12px",
            background: "#1e293b",
            minHeight: "400px",
          }}
        >
          <h3
            style={{
              margin: "0 0 10px 0",
              fontSize: "1em",
              color: "#94a3b8",
              borderBottom: "1px solid #334155",
              paddingBottom: "6px",
            }}
          >
            Explorer
          </h3>
          {treeData ? (
            <TreeNode
              node={treeData}
              selectedId={selectedNode?.id || null}
              onSelectNode={handleSelectNode}
            />
          ) : (
            <p style={{ color: "#64748b" }}>Waiting for Roblox Data...</p>
          )}
        </div>

        {/* Right: Interactive Properties Panel */}
        <div
          style={{
            border: "1px solid #334155",
            borderRadius: "8px",
            padding: "12px",
            background: "#1e293b",
          }}
        >
          <h3
            style={{
              margin: "0 0 10px 0",
              fontSize: "1em",
              color: "#94a3b8",
              borderBottom: "1px solid #334155",
              paddingBottom: "6px",
            }}
          >
            Edit Properties
          </h3>
          {selectedNode ? (
            <div>
              <div style={{ marginBottom: "15px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8em",
                    color: "#94a3b8",
                    marginBottom: "4px",
                  }}
                >
                  Name
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    style={{
                      flex: 1,
                      background: "#0f172a",
                      border: "1px solid #475569",
                      color: "#fff",
                      padding: "4px 8px",
                      borderRadius: "4px",
                    }}
                  />
                  <button
                    onClick={() => handleUpdateProperty("Name", editName)}
                    style={{
                      background: "#0284c7",
                      color: "#fff",
                      border: "none",
                      padding: "4px 10px",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>

              {selectedNode.properties && (
                <table
                  style={{
                    width: "100%",
                    fontSize: "0.85em",
                    borderCollapse: "collapse",
                  }}
                >
                  <tbody>
                    {Object.entries(selectedNode.properties).map(
                      ([key, val]) => (
                        <tr
                          key={key}
                          style={{ borderBottom: "1px solid #334155" }}
                        >
                          <td style={{ padding: "6px 0", color: "#94a3b8" }}>
                            {key}
                          </td>
                          <td
                            style={{
                              padding: "6px 0",
                              textAlign: "right",
                              color: "#f1f5f9",
                            }}
                          >
                            {String(val)}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <p style={{ color: "#64748b", fontSize: "0.85em" }}>
              Select an object to edit properties
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
