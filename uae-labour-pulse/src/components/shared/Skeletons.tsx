/** Skeleton loading components for Observator */

const shimmer = 'animate-pulse bg-surface-tertiary rounded';

export const SkeletonKPICard = () => (
  <div className="bg-card rounded-xl border border-border-light shadow-card border-t-2 border-t-border p-4">
    <div className="flex items-center gap-2 mb-3">
      <div className={`w-7 h-7 rounded-lg ${shimmer}`} />
      <div className={`h-3 w-24 ${shimmer}`} />
    </div>
    <div className="flex items-end justify-between">
      <div>
        <div className={`h-7 w-16 mb-2 ${shimmer}`} />
        <div className={`h-3 w-28 ${shimmer}`} />
      </div>
      <div className={`w-20 h-10 ${shimmer}`} />
    </div>
  </div>
);

export const SkeletonChart = ({ height = 240 }: { height?: number }) => (
  <div className="bg-card rounded-xl border border-border-light shadow-card p-4">
    <div className={`h-4 w-48 mb-4 ${shimmer}`} />
    <div className={`w-full ${shimmer}`} style={{ height }} />
  </div>
);

export const SkeletonTableRow = ({ cols = 6 }: { cols?: number }) => (
  <tr className="border-t border-border-light">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="px-4 py-3">
        <div className={`h-3.5 ${shimmer}`} style={{ width: `${50 + Math.random() * 40}%` }} />
      </td>
    ))}
  </tr>
);

export const SkeletonTable = ({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) => (
  <div className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden">
    <div className="p-4 border-b border-border-light">
      <div className={`h-4 w-40 ${shimmer}`} />
    </div>
    <table className="w-full">
      <thead>
        <tr className="bg-surface-tertiary">
          {Array.from({ length: cols }).map((_, i) => (
            <th key={i} className="px-4 py-2.5">
              <div className={`h-3 w-16 ${shimmer}`} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonTableRow key={i} cols={cols} />
        ))}
      </tbody>
    </table>
  </div>
);

export const SkeletonPage = () => (
  <div className="space-y-4">
    {/* Header */}
    <div className="flex items-center justify-between">
      <div>
        <div className={`h-6 w-48 mb-2 ${shimmer}`} />
        <div className={`h-3.5 w-64 ${shimmer}`} />
      </div>
      <div className={`h-9 w-28 rounded-xl ${shimmer}`} />
    </div>
    {/* KPI Cards */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonKPICard key={i} />
      ))}
    </div>
    {/* Charts */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SkeletonChart />
      <SkeletonChart />
    </div>
    {/* Table */}
    <SkeletonTable />
  </div>
);
