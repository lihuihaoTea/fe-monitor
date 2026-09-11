interface PerformancePanelProps {
  stats: any;
}

export function PerformancePanel({ stats }: PerformancePanelProps) {
  const { performance } = stats;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">性能指标</h2>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="FCP (首次内容绘制)"
          value={performance.fcp || 0}
          unit="ms"
          color="blue"
        />
        <MetricCard
          title="LCP (最大内容绘制)"
          value={performance.lcp || 0}
          unit="ms"
          color="blue"
        />
        <MetricCard
          title="页面加载时间"
          value={performance.load || 0}
          unit="ms"
          color="green"
        />
        <MetricCard
          title="DOM Ready"
          value={performance.domReady || 0}
          unit="ms"
          color="green"
        />
      </div>

      <div className="mt-4 p-4 bg-gray-50 rounded">
        <div className="text-sm text-gray-600">
          <p className="mb-1">性能评级标准：</p>
          <p>FCP: {'<'} 1.8s 优秀, {'<'} 3s 一般, {'>'}= 3s 需优化</p>
          <p>LCP: {'<'} 2.5s 优秀, {'<'} 4s 一般, {'>'}= 4s 需优化</p>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: number;
  unit: string;
  color: string;
}

function MetricCard({ title, value, unit, color }: MetricCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color as keyof typeof colorClasses]}`}>
      <div className="text-sm opacity-80">{title}</div>
      <div className="text-2xl font-bold mt-1">
        {value.toLocaleString()}
        <span className="text-sm ml-1">{unit}</span>
      </div>
    </div>
  );
}
