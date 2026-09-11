interface BehaviorPanelProps {
  stats: any;
}

export function BehaviorPanel({ stats }: BehaviorPanelProps) {
  const { behavior } = stats;

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}分${seconds % 60}秒`;
    }
    return `${seconds}秒`;
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">用户行为</h2>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="页面访问 (PV)"
          value={behavior.pv || 0}
          color="purple"
        />
        <MetricCard
          title="独立访客 (UV)"
          value={behavior.uv || 0}
          color="indigo"
        />
        <div className="bg-pink-50 text-pink-700 rounded-lg p-4">
          <div className="text-sm opacity-80">平均停留时长</div>
          <div className="text-2xl font-bold mt-1">
            {formatDuration(behavior.avgStay || 0)}
          </div>
        </div>
        <MetricCard
          title="总点击次数"
          value={behavior.totalClicks || 0}
          color="teal"
        />
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: number;
  color: string;
}

function MetricCard({ title, value, color }: MetricCardProps) {
  const colorClasses = {
    purple: 'bg-purple-50 text-purple-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    pink: 'bg-pink-50 text-pink-700',
    teal: 'bg-teal-50 text-teal-700',
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color as keyof typeof colorClasses]}`}>
      <div className="text-sm opacity-80">{title}</div>
      <div className="text-2xl font-bold mt-1">{value.toLocaleString()}</div>
    </div>
  );
}
