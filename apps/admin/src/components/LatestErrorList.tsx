import { Badge, Card, Table, Tag, Typography, theme } from 'antd';
import dayjs from 'dayjs';
import type { LatestErrorItem } from '@/lib/types';

interface LatestErrorListProps {
  title: string;
  data: LatestErrorItem[];
  loading?: boolean;
}

function CopyableText({
  value,
  type,
}: {
  value?: string;
  type?: 'secondary';
}) {
  const text = value || '-';
  return (
    <Typography.Text
      type={type}
      copyable={text !== '-' ? { text } : false}
      ellipsis={{ tooltip: text }}
      style={{ maxWidth: '100%' }}
    >
      {text}
    </Typography.Text>
  );
}

function formatUser(userName?: string, userId?: string) {
  const name = userName?.trim();
  const id = userId != null && String(userId).trim() !== '' ? String(userId) : '';
  if (!name && !id) return '-';
  if (name && id) return `${name} (${id})`;
  return name || id;
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
            width: 150,
            render: (value: number) =>
              value ? dayjs(value).format('MM-DD HH:mm:ss') : '-',
          },
          {
            title: '类型',
            dataIndex: 'subType',
            width: 90,
            render: (value: string) =>
              value ? <Tag bordered={false}>{value}</Tag> : '-',
          },
          {
            title: '用户',
            key: 'user',
            width: 160,
            ellipsis: true,
            render: (_: unknown, record: LatestErrorItem) => {
              const text = formatUser(record.userName, record.userId);
              return (
                <Typography.Text
                  copyable={text !== '-' ? { text } : false}
                  ellipsis={{ tooltip: text }}
                >
                  {text}
                </Typography.Text>
              );
            },
          },
          {
            title: '信息',
            dataIndex: 'message',
            width: 320,
            ellipsis: true,
            render: (value: string) => <CopyableText value={value} />,
          },
          {
            title: '页面',
            dataIndex: 'url',
            width: 280,
            ellipsis: true,
            render: (value: string) => (
              <CopyableText value={value} type="secondary" />
            ),
          },
        ]}
      />
    </Card>
  );
}
