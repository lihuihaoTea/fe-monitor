import { Card, Segmented, Space, Spin, Table, Typography } from 'antd';
import { MetricSummary } from '@/components/MetricSummary';
import { CombinedTrendChart } from '@/components/CombinedTrendChart';
import { LatestErrorList } from '@/components/LatestErrorList';
import {
  LATEST_LIMIT_OPTIONS,
  useFilters,
  type LatestLimit,
} from '@/context/FilterContext';

export function StabilityDashboard() {
  const { stats, loading, latestLimit, setLatestLimit } = useFilters();
  const errors = stats?.errors;
  const stability = stats?.stability;
  const daily = stats?.daily || [];
  const latest = stats?.latest;
  const listLoading = loading && !stats;

  return (
    <Spin spinning={loading}>
      <div className="monitor-page">
        <MetricSummary
          loading={listLoading}
          items={[
            { title: 'JS 错误', value: errors?.total || 0 },
            { title: '资源加载失败', value: stability?.resourceErrors || 0 },
            { title: 'API 失败', value: stability?.apiErrors || 0 },
            { title: '白屏次数', value: stability?.blankScreens || 0 },
            { title: '404', value: stability?.notFound404 || 0 },
          ]}
        />

        <CombinedTrendChart
          title="稳定性趋势"
          data={daily}
          loading={listLoading}
          series={[
            { name: 'JS 错误', field: 'errors' },
            { name: '资源失败', field: 'resourceErrors' },
            { name: 'API 失败', field: 'apiErrors' },
            { name: '白屏', field: 'blankScreens' },
            { name: '404', field: 'notFound404' },
          ]}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <Typography.Text type="secondary">最新错误列表</Typography.Text>
          <Space size={8}>
            <Typography.Text type="secondary">条数</Typography.Text>
            <Segmented
              value={latestLimit}
              options={LATEST_LIMIT_OPTIONS.map((n) => ({
                label: String(n),
                value: n,
              }))}
              onChange={(value) => setLatestLimit(value as LatestLimit)}
            />
          </Space>
        </div>

        <LatestErrorList
          title="最新 JS 错误"
          data={latest?.jsErrors || []}
          loading={listLoading}
        />

        <LatestErrorList
          title="最新资源失败"
          data={latest?.resourceErrors || []}
          loading={listLoading}
        />

        <LatestErrorList
          title="最新 API 失败"
          data={latest?.apiErrors || []}
          loading={listLoading}
        />

        <LatestErrorList
          title="最新 404"
          data={latest?.notFound404 || []}
          loading={listLoading}
        />

        <Card
          className="monitor-card monitor-table-card"
          title="错误类型分布"
          styles={{ body: { paddingTop: 4, paddingBottom: 8 } }}
        >
          <Table
            rowKey="sub_type"
            size="small"
            pagination={false}
            loading={listLoading}
            scroll={{ x: '100%', y: 300 }}
            tableLayout="fixed"
            dataSource={errors?.byType || []}
            columns={[
              { title: '错误类型', dataIndex: 'sub_type', width: 480, ellipsis: true },
              { title: '次数', dataIndex: 'count', width: 120 },
            ]}
            locale={{ emptyText: '暂无数据' }}
          />
        </Card>
      </div>
    </Spin>
  );
}
