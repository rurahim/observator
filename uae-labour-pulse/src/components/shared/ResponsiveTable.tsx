import { ReactNode } from 'react';

interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  primary?: boolean;
  hideOnMobile?: boolean;
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
}

function ResponsiveTable<T>({ data, columns, keyExtractor, onRowClick }: ResponsiveTableProps<T>) {
  const primaryCol = columns.find(c => c.primary) || columns[0];
  const secondaryCols = columns.filter(c => c !== primaryCol);

  return (
    <>
      {/* Desktop: regular table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-tertiary">
              {columns.map(col => (
                <th key={col.key} className="px-4 py-2.5 text-left text-xs font-medium text-text-muted whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr
                key={keyExtractor(row)}
                onClick={() => onRowClick?.(row)}
                className={`border-t border-border-light hover:bg-surface-hover transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map(col => (
                  <td key={col.key} className="px-4 py-3">
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: card stack */}
      <div className="lg:hidden space-y-2 p-3">
        {data.map(row => (
          <div
            key={keyExtractor(row)}
            onClick={() => onRowClick?.(row)}
            className={`bg-surface-secondary/50 rounded-xl p-3.5 border border-border-light ${onRowClick ? 'cursor-pointer active:bg-surface-hover' : ''}`}
          >
            {/* Primary field as header */}
            <div className="mb-2">{primaryCol.render(row)}</div>
            {/* Secondary fields in a grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {secondaryCols.filter(c => !c.hideOnMobile).map(col => (
                <div key={col.key} className="flex flex-col">
                  <span className="text-[10px] text-text-muted uppercase tracking-wide">{col.label}</span>
                  <span className="text-xs text-text-secondary">{col.render(row)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default ResponsiveTable;
