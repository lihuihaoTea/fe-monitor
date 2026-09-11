'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DailyTrendChartProps {
  daily: any[];
}

export function DailyTrendChart({ daily }: DailyTrendChartProps) {
  if (!daily || daily.length === 0) {
    return null;
  }

  const chartData = [...daily].reverse();

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">每日趋势</h2>
      
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="pv" stroke="#8b5cf6" name="PV" />
          <Line type="monotone" dataKey="uv" stroke="#3b82f6" name="UV" />
          <Line type="monotone" dataKey="errors" stroke="#ef4444" name="错误" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
