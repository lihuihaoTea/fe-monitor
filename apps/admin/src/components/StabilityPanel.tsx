interface StabilityPanelProps {
  stats: any;
}

export function StabilityPanel({ stats }: StabilityPanelProps) {
  const { errors, stability } = stats;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">稳定性指标</h2>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="JS 错误"
          value={errors.total || 0}
          color="red"
        />
        <MetricCard
          title="资源加载失败"
          value={stability.resourceErrors || 0}
          color="orange"
        />
        <MetricCard
          title="API 失败"
          value={stability.apiErrors || 0}
          color="yellow"
        />
        <MetricCard
          title="白屏次数"
          value={stability.blankScreens || 0}
          color="purple"
        />
      </div>

      {errors.byType && errors.byType.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">错误类型分布</h3>
          <div className="space-y-2">
            {errors.byType.map((item: any) => (
              <div key={item.sub_type} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{item.sub_type}</span>
                <span className="text-sm font-medium">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
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
    red: 'bg-red-50 text-red-700',
    orange: 'bg-orange-50 text-orange-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    purple: 'bg-purple-50 text-purple-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color as keyof typeof colorClasses]}`}>
      <div className="text-sm opacity-80">{title}</div>
      <div className="text-2xl font-bold mt-1">{value.toLocaleString()}</div>
    </div>
  );
}
