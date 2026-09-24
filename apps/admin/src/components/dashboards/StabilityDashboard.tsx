'use client';

import { Col, Row, Spin, Table } from 'antd';
import { MetricSummary } from '@/components/MetricSummary';
import { TrendChart } from '@/components/TrendChart';
import { LatestErrorList } from '@/components/LatestErrorList';
import { useFilters } from '@/context/FilterContext';

export function StabilityDashboard() {
  const { stats, loading } = useFilters();
  const errors = stats?.errors;
  const stability = stats?.stability;
  const daily = stats?.daily || [];
  const latest = stats?.latest;

  return (
    <Spin spinning={loading}>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <MetricSummary
            loading={loading && !stats}
            items={[
              { title: 'JS 错误', value: errors?.total || 0 },
              { title: '资源加载失败', value: stability?.resourceErrors || 0 },
              { title: 'API 失败', value: stability?.apiErrors || 0 },
              { title: '白屏次数', value: stability?.blankScreens || 0 },
            ]}
          />
        </Col>

        <Col xs={24} lg={12}>
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <TrendChart
                title="JS 错误趋势"
                data={daily}
                yField="errors"
                loading={loading && !stats}
              />
            </Col>
            <Col span={24}>
              <LatestErrorList
                title="最新 JS 错误"
                data={latest?.jsErrors || []}
                loading={loading && !stats}
              />
            </Col>
          </Row>
        </Col>

        <Col xs={24} lg={12}>
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <TrendChart
                title="资源失败趋势"
                data={daily}
                yField="resourceErrors"
                loading={loading && !stats}
              />
            </Col>
            <Col span={24}>
              <LatestErrorList
                title="最新资源失败"
                data={latest?.resourceErrors || []}
                loading={loading && !stats}
              />
            </Col>
          </Row>
        </Col>

        <Col xs={24} lg={12}>
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <TrendChart
                title="API 失败趋势"
                data={daily}
                yField="apiErrors"
                loading={loading && !stats}
              />
            </Col>
            <Col span={24}>
              <LatestErrorList
                title="最新 API 失败"
                data={latest?.apiErrors || []}
                loading={loading && !stats}
              />
            </Col>
          </Row>
        </Col>

        <Col xs={24} lg={12}>
          <TrendChart
            title="白屏趋势"
            data={daily}
            yField="blankScreens"
            loading={loading && !stats}
          />
        </Col>

        <Col span={24}>
          <Table
            rowKey="sub_type"
            size="middle"
            pagination={false}
            loading={loading && !stats}
            dataSource={errors?.byType || []}
            columns={[
              { title: '错误类型', dataIndex: 'sub_type' },
              { title: '次数', dataIndex: 'count' },
            ]}
            title={() => '错误类型分布'}
            locale={{ emptyText: '暂无数据' }}
          />
        </Col>
      </Row>
    </Spin>
  );
}
