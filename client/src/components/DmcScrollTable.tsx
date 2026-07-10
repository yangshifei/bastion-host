import React, { useMemo } from 'react';

export interface DmcScrollColumn<T = Record<string, unknown>> {
  key: string;
  title: string;
  width?: number;
  render?: (row: T, index: number) => React.ReactNode;
}

interface DmcScrollTableProps<T extends object> {
  columns: DmcScrollColumn<T>[];
  rows: T[];
  rowKey?: keyof T | ((row: T, index: number) => string | number);
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function resolveRowKey<T extends object>(
  row: T,
  index: number,
  rowKey?: keyof T | ((row: T, index: number) => string | number),
): string | number {
  if (typeof rowKey === 'function') return rowKey(row, index);
  if (rowKey !== undefined) return String((row as Record<string, unknown>)[rowKey as string] ?? index);
  return index;
}

export function DmcScrollTable<T extends object>({
  columns,
  rows,
  rowKey,
}: DmcScrollTableProps<T>) {
  const tableWidth = useMemo(
    () => columns.reduce((sum, col) => sum + (col.width ?? 120), 0),
    [columns],
  );

  return (
    <div className="dmc-scroll-table">
      <table
        className="dmc-scroll-table__inner"
        style={{ width: tableWidth, minWidth: '100%' }}
      >
        <colgroup>
          {columns.map((col) => (
            <col key={col.key} style={{ width: col.width ?? 120 }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={resolveRowKey(row, index, rowKey)}>
              {columns.map((col) => (
                <td key={col.key} title={col.render ? undefined : formatCell((row as Record<string, unknown>)[col.key])}>
                  {col.render ? col.render(row, index) : formatCell((row as Record<string, unknown>)[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
