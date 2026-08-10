export interface RenameChange {
  type: "rename";
  instanceId: string;
  newName: string;
}

export interface MoveChange {
  type: "move";
  instanceId: string;
  newParentId: string;
}

export interface CreateChange {
  type: "create";
  parentId: string;
  className: string;
  name: string;
}

export interface DeleteChange {
  type: "delete";
  instanceId: string;
}

export interface UpdatePropertyChange {
  type: "update-property";
  instanceId: string;
  property: string;
  value: unknown;
}

export interface UpdateScriptChange {
  type: "update-script";
  instanceId: string;
  source: string;
}

export type ChangeOperation =
  | RenameChange
  | MoveChange
  | CreateChange
  | DeleteChange
  | UpdatePropertyChange
  | UpdateScriptChange;

export interface ChangeSet {
  id: string;
  changes: ChangeOperation[];
}
