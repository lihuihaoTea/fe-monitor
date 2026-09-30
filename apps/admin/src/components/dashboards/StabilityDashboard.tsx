import { Card, Table } from 'antd';
import { MetricSummary } from '@/components/MetricSummary';
import { CombinedTrendChart } from '@/components/CombinedTrendChart';
import { LatestErrorList } from '@/components/LatestErrorList';
import { useFilters } from '@/hooks/useFilters';
import { formatNumber } from '@/lib/format';

export function StabilityDashboard() {
  const { stats, loading } = useFilters();
  const errors = stats?.errors;
  const stability = stats?.stability;
  const daily = stats?.daily || [];

  return (
    <div className="monitor-page">
      <MetricSummary
        loading={loading}
        items={[
          {
            title: 'JS 错误',
            value: errors?.total || 0,
            description:
              '脚本运行时错误与未捕获 Promise 异常（js / promise），不含业务主动上报。',
          },
          {
            title: '资源加载失败',
            value: stability?.resourceErrors || 0,
            description:
              '图片、脚本、样式等静态资源加载失败次数，影响页面展示与功能可用性。',
          },
          {
            title: 'API 失败',
            value: stability?.apiErrors || 0,
            description:
              'XHR / Fetch 请求失败或异常状态次数，反映接口可用性与前后端联调问题。',
          },
          {
            title: '白屏次数',
            value: stability?.blankScreens || 0,
            description:
              '检测到页面长时间无有效内容渲染的次数，通常意味着严重渲染或启动失败。',
          },
          {
            title: '其他问题',
            value: stability?.otherIssues || 0,
            description:
              '业务通过 monitor.error 主动上报的问题（如 404、自定义异常），不含系统 JS 错误。',
          },
        ]}
      />

      <CombinedTrendChart
        title="稳定性趋势"
        data={daily}
        xField="date"
        loading={loading}
        series={[
          { name: 'JS 错误', field: 'errors' },
          { name: '资源失败', field: 'resourceErrors' },
          { name: 'API 失败', field: 'apiErrors' },
          { name: '白屏', field: 'blankScreens' },
          { name: '其他问题', field: 'otherIssues' },
        ]}
      />

      <LatestErrorList title="JS 错误" category="js" />
      <LatestErrorList title="资源加载失败" category="resource" />
      <LatestErrorList title="API 失败" category="api" />
      <LatestErrorList title="其他问题" category="other" />

      <Card
        className="monitor-card monitor-table-card"
        title="错误类型分布"
        styles={{ body: { paddingTop: 4, paddingBottom: 8 } }}
      >
        <Table
          rowKey="sub_type"
          size="small"
          pagination={false}
          loading={loading}
          scroll={{ x: '100%', y: 300 }}
          tableLayout="fixed"
          dataSource={errors?.byType || []}
          columns={[
            { title: '错误类型', dataIndex: 'sub_type', width: 480, ellipsis: true },
            {
              title: '次数',
              dataIndex: 'count',
              width: 120,
              render: (value: number) => formatNumber(value),
            },
          ]}
          locale={{ emptyText: '暂无数据' }}
        />
      </Card>
    </div>
  );
}
