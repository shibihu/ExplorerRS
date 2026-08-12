import type { HierarchySnapshot } from "./hierarchy.js";
import type { ChangeSet } from "./changes.js";

export const PROTOCOL_VERSION = 1;

export type MessageType =
  | "connection.hello"
  | "connection.ready"
  | "connection.error"
  | "hierarchy.request"
  | "hierarchy.response"
  | "script.request"
  | "script.response"
  | "properties.request"
  | "properties.response"
  | "changes.apply"
  | "changes.result"
  | "selection.change"
  | "create"
  | "delete"
  | "restore_snapshot";

export interface ExplorerRSMessage<T = unknown> {
  type: MessageType;
  requestId?: string;
  protocolVersion: number;
  payload?: T;
}

export function parseMessage(data: string): ExplorerRSMessage | null {
  try {
    const msg = JSON.parse(data);
    if (
      msg &&
      typeof msg === "object" &&
      typeof msg.type === "string" &&
      typeof msg.protocolVersion === "number"
    ) {
      return msg as ExplorerRSMessage;
    }
  } catch {
    // Silent catch
  }
  return null;
}

export interface HierarchyResponsePayload {
  snapshot: HierarchySnapshot;
}

export interface ScriptRequestPayload {
  instanceId: string;
}

export interface ScriptResponsePayload {
  instanceId: string;
  source: string;
}

export interface ChangesApplyPayload {
  changeSet: ChangeSet;
}

export interface ChangeResult {
  changeId?: string;
  success: boolean;
  error?: {
    code: string;
    message: string;
  };
}

export interface ChangesResultPayload {
  success: boolean;
  results: ChangeResult[];
}
