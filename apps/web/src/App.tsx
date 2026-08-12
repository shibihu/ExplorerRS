import { useEffect, useState, useRef } from "react";
import { parseMessage } from "@explorerrs/shared";
import ShinyText from "@/components/ShinyText";
import GlareHover from "@/components/GlareHover";
import PillNav from "@/components/PillNav";
import AnimatedContent from "@/components/AnimatedContent";
import "./App.css";

interface InstanceNode {
  id: string;
  name: string;
  className: string;
  properties?: Record<string, unknown>;
  children?: InstanceNode[];
}

// Loose shape for hierarchy change operations coming from the bridge / Roblox
interface LocalChange {
  type: string;
  instanceId?: string;
  parentId?: string;
  className?: string;
  name?: string;
  newName?: string;
  newParentId?: string;
  property?: string;
  value?: unknown;
  source?: string;
}

const STORAGE_KEY = "explorerrs_saved_hierarchy";

// Inline SVG logo (compass mark) rendered as a data URI for PillNav
const LOGO = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHJlY3QgeD0iMSIgeT0iMSIgd2lkdGg9IjM0IiBoZWlnaHQ9IjM0IiByeD0iOSIgZmlsbD0iIzBlYTVlOSIvPjxjaXJjbGUgY3g9IjE4IiBjeT0iMTgiIHI9IjkiIGZpbGw9IiMwZjE3MmEiLz48cGF0aCBkPSJNMTggMTEgTDIxIDE4IEwxOCAyNSBMMTUgMTggWiIgZmlsbD0iI2UwZjJmZSIvPjwvc3ZnPg==";

// PillNav items — hash hrefs keep the switcher state-driven (#live / #snapshot)
const PILL_ITEMS = [
  { href: "#live", label: "Live Studio Explorer" },
  { href: "#snapshot", label: "Saved Snapshot" },
];

const CLASS_ICONS: Record<string, string> = {
  Workspace: "🌐",
  Camera: "🎥",
  Part: "🧊",
  SpawnLocation: "🚩",
  Model: "📦",
  Folder: "📁",
  Script: "📜",
  LocalScript: "📜",
  Decal: "🖼️",
};

const CREATABLE_CLASSES = ["Part", "Folder", "Model", "Script", "Configuration"];

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
          transition: "background-color 0.15s ease",
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

// Helper Functions
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

function applyChanges(root: InstanceNode, changes: LocalChange[]): InstanceNode {
  const cloned = deepClone(root);
  for (const change of changes) {
    try {
      if (change.type === "rename") {
        const target = change.instanceId ? findNode(cloned, change.instanceId) : null;
        if (target) target.name = change.newName ?? target.name;
      } else if (change.type === "delete") {
        if (change.instanceId) removeNode(cloned, change.instanceId);
      } else if (change.type === "create") {
        const parent = change.parentId ? findNode(cloned, change.parentId) : null;
        if (parent && change.name && change.className) {
          if (!parent.children) parent.children = [];
          const id = change.instanceId || `${change.name}-${Date.now()}`;
          const exists = parent.children.some((c) => c.id === id);
          if (!exists) {
            parent.children.push({
              id,
              name: change.name,
              className: change.className,
              children: [],
            });
          }
        }
      } else if (change.type === "move") {
        if (change.instanceId && change.newParentId) {
          const nodeToMove = removeNode(cloned, change.instanceId);
          if (nodeToMove) {
            const newParent = findNode(cloned, change.newParentId);
            if (newParent) {
              if (!newParent.children) newParent.children = [];
              newParent.children.push(nodeToMove);
            }
          }
        }
      } else if (change.type === "update-property") {
        const target = change.instanceId ? findNode(cloned, change.instanceId) : null;
        if (target && change.property) {
          if (!target.properties) target.properties = {};
          target.properties[change.property] = change.value;
          if (change.property === "Name") target.name = String(change.value ?? "");
        }
      }
    } catch (e) {
      console.error("[Web] Error applying change:", change, e);
    }
  }
  return cloned;
}

type DiffChange =
  | { type: "create"; parentId: string; className: string; name: string }
  | { type: "delete"; instanceId: string }
  | { type: "rename"; instanceId: string; newName: string }
  | { type: "update-property"; instanceId: string; property: string; value: unknown };

/**
 * Diff a snapshot against the live tree and produce the full set of
 * changes needed to restore the snapshot: structural (create/delete)
 * plus name/property differences.
 */
function collectDiffChanges(
  snapshotRoot: InstanceNode,
  liveRoot: InstanceNode
): DiffChange[] {
  const changes: DiffChange[] = [];

  // Whether a node with the same name/className exists under the given
  // parent. This keeps the diff idempotent: a node recreated by Roblox gets
  // a fresh DebugId, so on the next restore it is recognized as the same
  // node instead of being duplicated or deleted.
  const matchesByShape = (
    tree: InstanceNode,
    parentId: string | null,
    name: string,
    className: string
  ): boolean => {
    const parent = parentId ? findNode(tree, parentId) : null;
    if (!parent || !parent.children) return false;
    return parent.children.some(
      (c) => c.name === name && c.className === className
    );
  };

  // 1. Delete nodes present in live but missing from the snapshot
  //    (they were added after the snapshot was saved).
  const walkLive = (node: InstanceNode, parentId: string | null) => {
    if (node.id !== liveRoot.id && !findNode(snapshotRoot, node.id)) {
      const matchedInSnapshot = matchesByShape(
        snapshotRoot,
        parentId,
        node.name,
        node.className
      );
      if (!matchedInSnapshot) {
        changes.push({ type: "delete", instanceId: node.id });
        return; // descendants are destroyed together with their parent
      }
    }
    if (node.children) {
      for (const child of node.children) walkLive(child, node.id);
    }
  };
  walkLive(liveRoot, null);

  // 2. Recreate nodes present in snapshot but missing from live
  //    (they were deleted after the snapshot was saved) and restore
  //    name/property diffs for nodes that exist in both trees.
  const walkSnapshot = (node: InstanceNode, parentId: string | null) => {
    const liveTarget = findNode(liveRoot, node.id);
    if (!liveTarget) {
      // Only recreate when its (snapshot) parent still exists in the live
      // tree and no matching node already lives there (e.g. a previously
      // recreated instance with a fresh DebugId).
      const parentLive = parentId ? findNode(liveRoot, parentId) : null;
      const matchedInLive = matchesByShape(
        liveRoot,
        parentId,
        node.name,
        node.className
      );
      if (parentId && parentLive && !matchedInLive) {
        changes.push({
          type: "create",
          parentId,
          className: node.className,
          name: node.name,
        });
      }
    } else {
      if (node.name !== liveTarget.name) {
        changes.push({ type: "rename", instanceId: node.id, newName: node.name });
      }
      if (node.properties) {
        for (const [propKey, propVal] of Object.entries(node.properties)) {
          if (propKey === "Name") continue; // handled by rename above
          const liveVal = liveTarget.properties?.[propKey];
          if (JSON.stringify(propVal) !== JSON.stringify(liveVal)) {
            changes.push({
              type: "update-property",
              instanceId: node.id,
              property: propKey,
              value: propVal,
            });
          }
        }
      }
    }
    if (node.children) {
      for (const child of node.children) walkSnapshot(child, node.id);
    }
  };
  walkSnapshot(snapshotRoot, null);

  return changes;
}

// Remove optimistic "pending-" nodes that the authoritative Roblox echo has
// now materialized as real instances (matched by parent + name + className).
function reconcilePendingCreates(
  tree: InstanceNode,
  incoming: LocalChange[]
): InstanceNode {
  const creates = incoming.filter((c) => c.type === "create");
  if (creates.length === 0) return tree;

  const cloned = deepClone(tree);
  const prune = (node: InstanceNode, parentId: string | null) => {
    if (!node.children) return;
    node.children = node.children.filter((child) => {
      if (child.id.startsWith("pending-") && parentId) {
        const echoed = creates.some(
          (c) =>
            c.parentId === parentId &&
            c.className === child.className &&
            c.name === child.name
        );
        return !echoed;
      }
      return true;
    });
    for (const child of node.children) prune(child, node.id);
  };
  prune(cloned, null);
  return cloned;
}

// Resolve the bridge base URL for the current environment (local dev / GitHub Codespaces)
function apiBase(): string {
  return window.location.hostname.includes("github.dev")
    ? `https://${window.location.hostname.replace(
        /-\d+\.app\.github\.dev$/,
        "-8080.app.github.dev"
      )}`
    : "http://localhost:8080";
}

// POST JSON and surface non-2xx responses as thrown errors
async function postJSON(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`POST ${url} failed (${res.status}): ${errText}`);
  }
  return res.json();
}

// Read the locally persisted snapshot once, on first render
function loadLocalSnapshot(): { tree: InstanceNode | null; savedAt: string | null } {
  try {
    const localSaved = localStorage.getItem(STORAGE_KEY);
    if (localSaved) {
      const parsed = JSON.parse(localSaved);
      if (parsed && parsed.data) {
        return {
          tree: parsed.data as InstanceNode,
          savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : null,
        };
      }
    }
  } catch (e) {
    console.error("Failed to parse local saved snapshot", e);
  }
  return { tree: null, savedAt: null };
}

// Snapshot persisted in localStorage is loaded once at module scope
const INITIAL_SNAPSHOT = loadLocalSnapshot();

export function App() {
  const [activeTab, setActiveTab] = useState<"live" | "snapshot">(() =>
    window.location.hash === "#snapshot" ? "snapshot" : "live"
  );
  const [connected, setConnected] = useState(false);

  const [liveTree, setLiveTree] = useState<InstanceNode | null>(null);

  // Snapshot is loaded once from localStorage at module scope
  const [snapshotTree, setSnapshotTree] = useState<InstanceNode | null>(
    INITIAL_SNAPSHOT.tree
  );
  const [savedTime, setSavedTime] = useState<string | null>(INITIAL_SNAPSHOT.savedAt);

  const [selectedNode, setSelectedNode] = useState<InstanceNode | null>(null);
  const [editName, setEditName] = useState("");

  // Input states for adding new instance
  const [newClassName, setNewClassName] = useState("Part");
  const [newChildName, setNewChildName] = useState("NewPart");
  // Modal State for Creating Instance
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClassName, setNewClassName] = useState("Part");
  const [newInstanceName, setNewInstanceName] = useState("NewPart");

  const wsRef = useRef<WebSocket | null>(null);

  // Refs mirroring state that the (single, stable) WebSocket handler needs.
  // Using refs instead of effect deps prevents the socket from being torn
  // down and re-created on every node selection / tab switch.
  const selectedNodeRef = useRef<InstanceNode | null>(null);
  const activeTabRef = useRef<"live" | "snapshot">("live");

  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Keep activeTab in sync with PillNav hash navigation
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "live" || hash === "snapshot") {
        setActiveTab(hash);
        setSelectedNode(null);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const hostname = window.location.hostname;
    const wsUrl = hostname.includes("github.dev")
      ? `wss://${hostname.replace(/-\d+\.app\.github\.dev$/, "-8080.app.github.dev")}`
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
        let parsed: { type?: string; data?: unknown; payload?: unknown } | null =
          parseMessage(event.data.toString());
        if (!parsed) parsed = JSON.parse(event.data.toString());
        if (!parsed) return;

        if (parsed.type === "hierarchy.full") {
          const data = parsed.data as { Workspace?: InstanceNode } | undefined;
          if (data && data.Workspace) {
            setLiveTree(data.Workspace);
          }
        } else if (parsed.type === "changes.apply") {
          const payload = parsed.payload as
            | { changeSet?: { changes?: LocalChange[] } }
            | undefined;
          const changes = payload?.changeSet?.changes;
          if (payload && payload.changeSet && Array.isArray(changes)) {
            setLiveTree((prevTree) => {
              if (!prevTree) return prevTree;
              // Drop optimistic pending nodes that Roblox just materialized
              const reconciled = reconcilePendingCreates(prevTree, changes);
              const nextTree = applyChanges(reconciled, changes);

              const sel = selectedNodeRef.current;
              if (sel && activeTabRef.current === "live") {
                const updatedSelected = findNode(nextTree, sel.id);
                if (updatedSelected) {
                  setSelectedNode(updatedSelected);
                  setEditName(updatedSelected.name);
                }
              }
              return nextTree;
            });
          }
        }
      } catch (err) {
        console.error("Error parsing WS message:", err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (wsRef.current === ws) wsRef.current = null;
    };

    return () => {
      ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, []);

  const handleSaveSnapshot = () => {
    if (!liveTree) return;
    const now = new Date().toLocaleTimeString();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        savedAt: now,
        data: liveTree,
      })
    );
    setSnapshotTree(deepClone(liveTree));
    setSavedTime(now);
    alert("บันทึก Live Hierarchy ลงใน Snapshot เรียบร้อยแล้ว!");
  };

  const handleSyncSnapshotToRoblox = async () => {
    console.log("[Web] Restore Snapshot triggered");
    if (!connected) {
      console.warn("[Web] Restore Snapshot aborted: bridge not connected");
      alert("ไม่สามารถ Sync ได้เนื่องจากไม่ได้เชื่อมต่อกับ Bridge Server");
      return;
    }
    if (!snapshotTree || !liveTree) {
      console.warn("[Web] Restore Snapshot aborted: missing snapshot/live tree", {
        snapshot: !!snapshotTree,
        live: !!liveTree,
      });
      return;
    }

    const changes = collectDiffChanges(snapshotTree, liveTree);
    if (changes.length === 0) {
      console.log("[Web] Restore Snapshot: no differences between snapshot and live tree");
      alert("ข้อมูล Snapshot ตรงกับใน Roblox Studio อยู่แล้ว ไม่มีความเปลี่ยนแปลง");
      return;
    }

    console.log(`[Web] Restore Snapshot: applying ${changes.length} change(s):`, changes);

    try {
      const result = await postJSON(`${apiBase()}/api/apply-changes`, { changes });
      console.log("[Web] Restore Snapshot queued on bridge:", result);
      alert(`ส่งการอัปเดตคืน Roblox Studio จำนวน ${changes.length} รายการเรียบร้อยแล้ว!`);
    } catch (err) {
      console.error("[Web] Error restoring snapshot to Roblox:", err);
      alert(`Restore Snapshot ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const currentDisplayTree = activeTab === "live" ? liveTree : snapshotTree;

  const handleSelectNode = (node: InstanceNode) => {
    setSelectedNode(node);
    setEditName(node.name);

    if (activeTab === "live") {
      try {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "selection.change",
              protocolVersion: 1,
              payload: { instanceId: node.id },
            })
          );
        }
      } catch (err) {
        console.error("Error sending selection change:", err);
      }
    }
  };

  // Create Instance Function
  const handleCreateInstance = async () => {
    console.log("[Web] Create Instance triggered:", {
      className: newClassName,
      name: newInstanceName,
      tab: activeTab,
    });
    const parentNode = selectedNode || currentDisplayTree;
    if (!parentNode) {
      console.warn("[Web] Create Instance aborted: no parent node (tree not loaded)");
      return;
    }
    if (!newInstanceName.trim()) {
      console.warn("[Web] Create Instance aborted: empty name");
      alert("กรุณาระบุชื่อ Instance");
      return;
    }

    if (activeTab === "live" && connected) {
      // Optimistic local insert for instant feedback. The authoritative
      // instance created in Roblox echoes back as changes.apply and the
      // pending node is reconciled away. Rolled back if the bridge rejects.
      const pendingId = `pending-${Date.now()}`;
      setLiveTree(
        applyChanges(currentDisplayTree!, [
          {
            type: "create",
            parentId: parentNode.id,
            className: newClassName,
            name: newInstanceName,
            instanceId: pendingId,
          },
        ])
      );

      try {
        const result = await postJSON(`${apiBase()}/api/create-instance`, {
          parentId: parentNode.id,
          className: newClassName,
          name: newInstanceName,
        });
        console.log("[Web] Create Instance queued on bridge:", result);
      } catch (err) {
        console.error("[Web] Error creating instance:", err);
        setLiveTree((prev) =>
          prev ? applyChanges(prev, [{ type: "delete", instanceId: pendingId }]) : prev
        );
        alert(`สร้าง Instance ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      // Local Tree Fallback / Snapshot mode
      const setTreeFunc = activeTab === "live" ? setLiveTree : setSnapshotTree;
      const updatedTree = applyChanges(currentDisplayTree!, [
        {
          type: "create",
          parentId: parentNode.id,
          className: newClassName,
          name: newInstanceName,
          instanceId: `local-${Date.now()}`,
        },
      ]);
      setTreeFunc(updatedTree);
      console.log(`[Web] Create Instance applied locally (${activeTab} mode)`);
    }

    setShowCreateModal(false);
  };

  // Delete Instance Function
  const handleDeleteInstance = async () => {
    console.log("[Web] Delete Instance triggered:", selectedNode?.name);
    if (!selectedNode || !currentDisplayTree) {
      console.warn("[Web] Delete Instance aborted: no selection or tree");
      return;
    }

    if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ ${selectedNode.name}?`)) {
      let bridgeOk = true;
      if (activeTab === "live" && connected) {
        try {
          const result = await postJSON(`${apiBase()}/api/delete-instance`, {
            id: selectedNode.id,
          });
          console.log("[Web] Delete Instance queued on bridge:", result);
        } catch (err) {
          bridgeOk = false;
          console.error("[Web] Error deleting instance:", err);
          alert(`ลบ Instance ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (bridgeOk) {
        // Optimistic local update so the UI reflects the removal immediately
        const setTreeFunc = activeTab === "live" ? setLiveTree : setSnapshotTree;
        const updatedTree = applyChanges(currentDisplayTree, [
          {
            type: "delete",
            instanceId: selectedNode.id,
          },
        ]);
        setTreeFunc(updatedTree);
        setSelectedNode(null);
        setEditName("");
        console.log(`[Web] Delete Instance applied locally (${activeTab} mode)`);
      }
    }
  };

  const handleUpdateProperty = async (property: string, value: unknown) => {
    console.log(`[Web] Update Property triggered: ${property} =`, value, "on", selectedNode?.name);
    if (!selectedNode || !currentDisplayTree) return;

    const setTreeFunc = activeTab === "live" ? setLiveTree : setSnapshotTree;

    const updatedTree = applyChanges(currentDisplayTree, [
      {
        type: "update-property",
        instanceId: selectedNode.id,
        property,
        value,
      },
    ]);

    setTreeFunc(updatedTree);
    const updatedSelected = findNode(updatedTree, selectedNode.id);
    if (updatedSelected) setSelectedNode(updatedSelected);

    if (activeTab === "live" && connected) {
      try {
        const result = await postJSON(`${apiBase()}/api/update-property`, {
          id: selectedNode.id,
          property,
          value,
        });
        console.log("[Web] Update Property queued on bridge:", result);
      } catch (err) {
        console.error("[Web] Error updating property:", err);
        alert(`อัปเดต Property ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  // Trigger Create Action
  const handleCreateInstance = () => {
    if (!selectedNode) return;
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const uniqueId = `new-inst-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        wsRef.current.send(
          JSON.stringify({
            type: "create",
            protocolVersion: 1,
            payload: {
              parentId: selectedNode.id,
              instanceId: uniqueId,
              className: newClassName,
              name: newChildName,
            },
          })
        );
        console.log("Sent create action for parentId:", selectedNode.id);
      }
    } catch (err) {
      console.error("Error sending create action:", err);
    }
  };

  // Trigger Delete Action
  const handleDeleteInstance = () => {
    if (!selectedNode) return;
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "delete",
            protocolVersion: 1,
            payload: {
              instanceId: selectedNode.id,
            },
          })
        );
        console.log("Sent delete action for instanceId:", selectedNode.id);
      }
    } catch (err) {
      console.error("Error sending delete action:", err);
    }
  };

  // Trigger Restore Snapshot Action
  const handleRestoreSnapshot = () => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const sampleSnapshot = {
          id: "workspace-root",
          name: "Workspace",
          className: "Workspace",
          properties: {
            Name: "Workspace",
            ClassName: "Workspace",
          },
          children: [
            {
              id: `spawn-${Date.now()}`,
              name: "SpawnLocation",
              className: "SpawnLocation",
              children: [],
            },
            {
              id: `folder-${Date.now()}`,
              name: "RebuiltFolder",
              className: "Folder",
              children: [
                {
                  id: `part-${Date.now()}`,
                  name: "RebuiltPart",
                  className: "Part",
                  children: [],
                },
              ],
            },
          ],
        };

        wsRef.current.send(
          JSON.stringify({
            type: "restore_snapshot",
            protocolVersion: 1,
            payload: {
              snapshot: sampleSnapshot,
            },
          })
        );
        console.log("Sent restore_snapshot action");
      }
    } catch (err) {
      console.error("Error sending restore snapshot action:", err);
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
      <div
        style={{
          marginBottom: "15px",
          fontSize: "0.9em",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
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
        <button
          onClick={handleRestoreSnapshot}
          style={{
            background: "#475569",
            color: "#fff",
            border: "none",
            padding: "6px 12px",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          🔄 Restore Snapshot
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 340px",
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
    <div className="app-shell">
      {/* Header & Connection Status */}
      <header className="app-header">
        <div className="app-header-left">
          <h1 className="app-title">
            <ShinyText
              text="ExplorerRS - Two-Way Sync"
              speed={3}
              color="#38bdf8"
              shineColor="#e0f2fe"
              spread={140}
            />
          </h1>
          <p className="app-subtitle">
            Live two-way hierarchy sync between your browser and Roblox Studio
          </p>
        </div>

        <div className="app-header-right">
          <div className={`status-badge ${connected ? "on" : "off"}`}>
            <span className="status-dot" />
            <span>{connected ? "Connected" : "Disconnected"}</span>
          </div>

          <button
            className="action-btn primary"
            onClick={handleSaveSnapshot}
            disabled={!liveTree}
          >
            💾 Save Snapshot
          </button>

          {savedTime && (
            <span className="saved-time" title="Last saved snapshot">
              Saved {savedTime}
            </span>
          )}
        </div>
      </header>

      {/* Navigation Tabs (PillNav) */}
      <div className="pillnav-wrap">
        <PillNav
          logo={LOGO}
          logoAlt="ExplorerRS"
          items={PILL_ITEMS}
          activeHref={`#${activeTab}`}
          baseColor="#1e293b"
          pillColor="#334155"
          pillTextColor="#cbd5e1"
          hoveredPillTextColor="#f8fafc"
          initialLoadAnimation={false}
        />
      </div>

        {/* Right: Interactive Actions & Properties Panel */}
        <div
          style={{
            border: "1px solid #334155",
            borderRadius: "8px",
            padding: "12px",
            background: "#1e293b",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {/* Edit Properties Section */}
          <div>
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

          {/* Instance Actions Section */}
          {selectedNode && (
            <div
              style={{
                borderTop: "1px solid #334155",
                paddingTop: "12px",
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px 0",
                  fontSize: "1em",
                  color: "#94a3b8",
                  paddingBottom: "6px",
                }}
              >
                Instance Actions
              </h3>

              {/* Add Child Sub-section */}
              <div
                style={{
                  background: "#0f172a",
                  padding: "10px",
                  borderRadius: "6px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  marginBottom: "12px",
                }}
              >
                <h4 style={{ margin: 0, fontSize: "0.85em", color: "#38bdf8" }}>
                  ➕ Add Child to {selectedNode.name}
                </h4>
                <div>
                  <label
                    style={{
                      fontSize: "0.75em",
                      color: "#94a3b8",
                      display: "block",
                      marginBottom: "2px",
                    }}
                  >
                    ClassName
                  </label>
                  <input
                    type="text"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      background: "#1e293b",
                      border: "1px solid #475569",
                      color: "#fff",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "0.8em",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: "0.75em",
                      color: "#94a3b8",
                      display: "block",
                      marginBottom: "2px",
                    }}
                  >
                    Instance Name
                  </label>
                  <input
                    type="text"
                    value={newChildName}
                    onChange={(e) => setNewChildName(e.target.value)}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      background: "#1e293b",
                      border: "1px solid #475569",
                      color: "#fff",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "0.8em",
                    }}
                  />
                </div>
                <button
                  onClick={handleCreateInstance}
                  style={{
                    background: "#22c55e",
                    color: "#fff",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.85em",
                    fontWeight: "bold",
                    marginTop: "4px",
                  }}
                >
                  Create Instance
                </button>
              </div>

              {/* Delete Instance Sub-section */}
              <button
                onClick={handleDeleteInstance}
                style={{
                  width: "100%",
                  background: "#ef4444",
                  color: "#fff",
                  border: "none",
                  padding: "8px 12px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "0.85em",
                  fontWeight: "bold",
                }}
              >
                🗑️ Delete selected {selectedNode.name}
              </button>
            </div>
          )}
      <div className="panels-grid">
        {/* Left: Explorer Tree Panel */}
        <GlareHover
          className="gh-panel"
          width="100%"
          height="100%"
          background="#1e293b"
          borderColor="#334155"
          borderRadius="14px"
          glareColor="#38bdf8"
          glareOpacity={0.18}
          glareSize={220}
          transitionDuration={700}
        >
          <div className="panel">
            <div className="panel-header">
              <h3 className="panel-title">
                {activeTab === "live" ? "🔴 Live Studio View" : "📁 Saved Snapshot View"}
              </h3>
              <div className="panel-actions">
                <button
                  className="action-btn success"
                  onClick={() => {
                    setNewInstanceName("New" + newClassName);
                    setShowCreateModal(true);
                  }}
                  disabled={!currentDisplayTree}
                >
                  ➕ Add Instance
                </button>

                {selectedNode && (
                  <button className="action-btn danger" onClick={handleDeleteInstance}>
                    🗑️ Delete
                  </button>
                )}

                {activeTab === "snapshot" && (
                  <button
                    className="action-btn info"
                    onClick={handleSyncSnapshotToRoblox}
                    disabled={!connected || !snapshotTree}
                  >
                    🔄 Restore Snapshot
                  </button>
                )}
              </div>
            </div>

            <div className="panel-scroll">
              <AnimatedContent
                key={activeTab}
                distance={24}
                direction="vertical"
                duration={0.5}
                ease="power3.out"
                threshold={0}
              >
                {currentDisplayTree ? (
                  <TreeNode
                    node={currentDisplayTree}
                    selectedId={selectedNode?.id || null}
                    onSelectNode={handleSelectNode}
                  />
                ) : (
                  <p className="empty-hint">
                    {activeTab === "live"
                      ? "Waiting for Roblox Studio connection..."
                      : "No saved snapshot found. Click 'Save Snapshot' first."}
                  </p>
                )}
              </AnimatedContent>
            </div>
          </div>
        </GlareHover>

        {/* Right: Properties Panel */}
        <GlareHover
          className="gh-panel"
          width="100%"
          height="100%"
          background="#1e293b"
          borderColor="#334155"
          borderRadius="14px"
          glareColor="#a78bfa"
          glareOpacity={0.16}
          glareSize={220}
          transitionDuration={700}
        >
          <div className="panel">
            <h3 className="panel-title">Properties</h3>

            <div className="panel-scroll">
              <AnimatedContent
                key={selectedNode?.id ?? "none"}
                distance={18}
                direction="horizontal"
                duration={0.45}
                ease="power3.out"
                threshold={0}
              >
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
                          className="input-field"
                        />
                        <button
                          className="action-btn primary"
                          onClick={() => handleUpdateProperty("Name", editName)}
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
                          {Object.entries(selectedNode.properties).map(([key, val]) => (
                            <tr key={key} style={{ borderBottom: "1px solid #334155" }}>
                              <td style={{ padding: "6px 0", color: "#94a3b8" }}>{key}</td>
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
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ) : (
                  <p className="empty-hint">Select an item to view properties</p>
                )}
              </AnimatedContent>
            </div>
          </div>
        </GlareHover>
      </div>

      {/* Modal: Create Instance */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3 className="modal-title">Create New Instance</h3>
            <p style={{ fontSize: "0.85em", color: "#94a3b8" }}>
              Parent: <strong>{selectedNode?.name || "Workspace"}</strong>
            </p>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "0.8em", color: "#94a3b8" }}>
                Class Name
              </label>
              <select
                value={newClassName}
                onChange={(e) => {
                  setNewClassName(e.target.value);
                  setNewInstanceName("New" + e.target.value);
                }}
                className="input-field"
                style={{ marginTop: "4px" }}
              >
                {CREATABLE_CLASSES.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "0.8em", color: "#94a3b8" }}>
                Instance Name
              </label>
              <input
                type="text"
                value={newInstanceName}
                onChange={(e) => setNewInstanceName(e.target.value)}
                className="input-field"
                style={{ marginTop: "4px" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                className="action-btn ghost"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button className="action-btn success" onClick={handleCreateInstance}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
