'use client';

import { useState, useEffect } from 'react';
import { StabilityPanel } from '@/components/StabilityPanel';
import { PerformancePanel } from '@/components/PerformancePanel';
import { BehaviorPanel } from '@/components/BehaviorPanel';
import { DailyTrendChart } from '@/components/DailyTrendChart';

export default function Home() {
  const [appId, setAppId] = useState('demo-app');
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchStats();
  }, [appId, dateRange]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const url = new URL('http://localhost:3100/api/stats');
      url.searchParams.set('appId', appId);
      url.searchParams.set('startDate', dateRange.start);
      url.searchParams.set('endDate', dateRange.end);

      const res = await fetch(url.toString());
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('获取统计数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">前端监控管理后台</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex gap-4 flex-wrap items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              应用 ID
            </label>
            <input
              type="text"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              className="border rounded px-3 py-2 w-48"
              placeholder="demo-app"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              开始日期
            </label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              结束日期
            </label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="border rounded px-3 py-2"
            />
          </div>

          <button
            onClick={fetchStats}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '加载中...' : '刷新数据'}
          </button>
        </div>

        {stats && (
          <div className="space-y-6">
            <StabilityPanel stats={stats} />
            <PerformancePanel stats={stats} />
            <BehaviorPanel stats={stats} />
            <DailyTrendChart daily={stats.daily} />
          </div>
        )}

        {!stats && !loading && (
          <div className="text-center py-12 text-gray-500">
            请输入应用 ID 并点击查询
          </div>
        )}
      </main>
    </div>
  );
}
