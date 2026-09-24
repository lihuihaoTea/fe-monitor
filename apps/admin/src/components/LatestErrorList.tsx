'use client';

import { Card, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import type { LatestErrorItem } from '@/lib/types';

interface LatestErrorListProps {
  title: string;
  data: LatestErrorItem[];
  loading?: boolean;
}

export function LatestErrorList({ title, data, loading }: LatestErrorListProps) {
  return (
    <Card title={title} size="small" styles={{ body: { paddingTop: 8 } }}>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        pagination={false}
        scroll={{ x: true }}
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
            width: 90,
            render: (value: string) => value || '-',
          },
          {
            title: '信息',
            dataIndex: 'message',
            ellipsis: true,
            render: (value: string) => (
              <Typography.Text ellipsis={{ tooltip: value }} style={{ maxWidth: 360 }}>
                {value || '-'}
              </Typography.Text>
            ),
          },
          {
            title: '页面',
            dataIndex: 'url',
            ellipsis: true,
            render: (value: string) => (
              <Typography.Text type="secondary" ellipsis={{ tooltip: value }} style={{ maxWidth: 220 }}>
                {value || '-'}
              </Typography.Text>
            ),
          },
        ]}
      />
    </Card>
  );
}
