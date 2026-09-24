'use client';

import { Card, Col, Row, Statistic } from 'antd';

export interface SummaryItem {
  title: string;
  value: number | string;
  suffix?: string;
  precision?: number;
}

export function MetricSummary({ items, loading }: { items: SummaryItem[]; loading?: boolean }) {
  return (
    <Card title="指标汇总" loading={loading} styles={{ body: { paddingBottom: 8 } }}>
      <Row gutter={[16, 16]}>
        {items.map((item) => {
          const raw = item.value;
          const value =
            typeof raw === 'number'
              ? Number.isFinite(raw)
                ? raw
                : 0
              : raw == null || raw === ''
                ? 0
                : raw;

          return (
            <Col xs={12} sm={8} md={6} key={item.title}>
              <Statistic
                title={item.title}
                value={value}
                suffix={item.suffix}
                precision={item.precision}
              />
            </Col>
          );
        })}
      </Row>
    </Card>
  );
}
