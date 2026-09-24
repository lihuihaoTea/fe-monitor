'use client';

import { Badge, Card, Table, Tag, Typography, theme } from 'antd';
import dayjs from 'dayjs';
import type { LatestErrorItem } from '@/lib/types';

interface LatestErrorListProps {
  title: string;
  data: LatestErrorItem[];
  loading?: boolean;
}

export function LatestErrorList({ title, data, loading }: LatestErrorListProps) {
  const { token } = theme.useToken();
  const count = data?.length || 0;

  return (
    <Card
      className="monitor-card monitor-table-card"
      size="small"
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {title}
          <Badge
            count={count}
            showZero
            overflowCount={999}
            style={{
              backgroundColor: count ? token.colorPrimary : token.colorTextQuaternary,
            }}
          />
        </span>
      }
      styles={{ body: { paddingTop: 4, paddingBottom: 8 } }}
    >
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        pagination={false}
        scroll={{ x: '100%', y: 300 }}
        tableLayout="fixed"
        locale={{ emptyText: '暂无报错' }}
        dataSource={data || []}
        columns={[
          {
            title: '时间',
            dataIndex: 'timestamp',
            width: 160,
            render: (value: number) =>
              value ? dayjs(value).format('MM-DD HH:mm:ss') : '-',
          },
          {
            title: '类型',
            dataIndex: 'subType',
            width: 100,
            render: (value: string) =>
              value ? <Tag bordered={false}>{value}</Tag> : '-',
          },
          {
            title: '信息',
            dataIndex: 'message',
            width: 360,
            ellipsis: true,
            render: (value: string) => (
              <Typography.Text ellipsis={{ tooltip: value }}>
                {value || '-'}
              </Typography.Text>
            ),
          },
          {
            title: '页面',
            dataIndex: 'url',
            width: 280,
            ellipsis: true,
            render: (value: string) => (
              <Typography.Text type="secondary" ellipsis={{ tooltip: value }}>
                {value || '-'}
              </Typography.Text>
            ),
          },
        ]}
      />
    </Card>
  );
}
