import { describe, expect, it } from "vitest";

import {
  PROTOCOL_VERSION,
  type ChangeSet,
  type ExplorerRSMessage,
  type InstanceNode,
  parseMessage,
} from "./index.js";

describe("ExplorerRS Shared Protocol", () => {
  it("uses protocol version 1", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it("safely parses a valid message", () => {
    const raw = JSON.stringify({
      type: "selection.change",
      protocolVersion: PROTOCOL_VERSION,
      payload: { instanceId: "inst-1" },
    });
    const parsed = parseMessage(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("selection.change");
    expect(parsed?.protocolVersion).toBe(1);
  });

  it("returns null for an invalid message", () => {
    const raw = JSON.stringify({
      type: "selection.change",
    });
    const parsed = parseMessage(raw);
    expect(parsed).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const parsed = parseMessage("not json");
    expect(parsed).toBeNull();
  });

  it("represents a Roblox hierarchy node", () => {
    const node: InstanceNode = {
      id: "workspace-001",
      name: "Workspace",
      className: "Workspace",
      parentId: null,
      path: "Workspace",
      children: [],
    };

    expect(node.name).toBe("Workspace");
    expect(node.className).toBe("Workspace");
    expect(node.parentId).toBeNull();
  });

  it("represents a change set", () => {
    const changeSet: ChangeSet = {
      id: "changes-001",
      changes: [
        {
          type: "rename",
          instanceId: "sword-001",
          newName: "SuperSword",
        },
      ],
    };

    expect(changeSet.changes).toHaveLength(1);
    expect(changeSet.changes[0].type).toBe("rename");
  });

  it("represents a protocol message", () => {
    const message: ExplorerRSMessage = {
      type: "hierarchy.request",
      protocolVersion: PROTOCOL_VERSION,
      requestId: "request-001",
    };

    expect(message.type).toBe("hierarchy.request");
    expect(message.protocolVersion).toBe(1);
  });
});
