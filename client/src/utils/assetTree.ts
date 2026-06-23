import type { SafeAsset } from '../types';

export interface AssetGroupRow {
  rowKey: string;
  isGroup: true;
  name: string;
  group_name: string;
  children: AssetTreeRow[];
}

export type AssetTreeRow = AssetGroupRow | (SafeAsset & { rowKey: string; isGroup?: false });

const UNGROUPED = '未分组';

export function normalizeGroupName(name: string | null | undefined): string {
  const trimmed = (name || '').trim();
  return trimmed || UNGROUPED;
}

/** Flat assets → tree rows grouped by group_name */
export function buildAssetTree(assets: SafeAsset[]): AssetTreeRow[] {
  const map = new Map<string, SafeAsset[]>();

  for (const asset of assets) {
    const group = normalizeGroupName(asset.group_name);
    const list = map.get(group) ?? [];
    list.push(asset);
    map.set(group, list);
  }

  const groups = Array.from(map.entries()).sort(([a], [b]) => {
    if (a === UNGROUPED) return 1;
    if (b === UNGROUPED) return -1;
    return a.localeCompare(b, 'zh-CN');
  });

  return groups.map(([groupName, items]) => ({
    rowKey: `group:${groupName}`,
    isGroup: true as const,
    name: groupName,
    group_name: groupName,
    children: items
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      .map((asset) => ({
        ...asset,
        rowKey: `asset:${asset.id}`,
        isGroup: false as const,
      })),
  }));
}

export function isAssetGroupRow(row: AssetTreeRow): row is AssetGroupRow {
  return Boolean((row as AssetGroupRow).isGroup);
}

export function countAssetsInTree(tree: AssetTreeRow[]): number {
  return tree.reduce((sum, node) => sum + (isAssetGroupRow(node) ? node.children.length : 1), 0);
}
