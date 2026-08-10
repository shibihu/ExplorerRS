export interface InstanceNode {
  id: string;
  name: string;
  className: string;
  parentId: string | null;
  path: string;
  children: InstanceNode[];
}

export interface HierarchySnapshot {
  snapshotId: string;
  protocolVersion: number;
  root: InstanceNode;
}
