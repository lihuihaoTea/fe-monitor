import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Card,
  Input,
  Space,
  Table,
  Typography,
  theme,
} from 'antd';
import type { TablePaginationConfig } from 'antd';
import dayjs from 'dayjs';
import { fetchLatestEvents } from '@/lib/api';
import type { LatestErrorItem } from '@/lib/types';
import { useFilters } from '@/context/FilterContext';
import { LIST_LIMIT_OPTIONS, type ListLimit } from '@/components/LatestErrorList';
import { formatNumber } from '@/lib/format';

interface PerformanceEventListProps {
  title: string;
  /** performance 事件的 sub_type：fcp | lcp | load | domReady */
  metric: 'fcp' | 'lcp' | 'load' | 'domReady';
}

function CopyableText({ value, type }: { value?: string; type?: 'secondary' }) {
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
  const id =
    userId != null && String(userId).trim() !== '' ? String(userId) : '';
  if (!name && !id) return '-';
  if (name && id) return `${name} (${id})`;
  return name || id;
}

function metricValue(record: LatestErrorItem, metric: string): number | null {
  const data = record.data || {};
  if (metric === 'domReady') {
    const v = Number(data.domReady ?? data.value);
    return Number.isFinite(v) ? Math.round(v) : null;
  }
  const v = Number(data.value);
  return Number.isFinite(v) ? Math.round(v) : null;
}

export function PerformanceEventList({ title, metric }: PerformanceEventListProps) {
  const { token } = theme.useToken();
  const { appId, dateRange } = useFilters();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ListLimit>(50);
  const [total, setTotal] = useState(0);
  const [urlKeyword, setUrlKeyword] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [data, setData] = useState<LatestErrorItem[]>([]);
  const [loading, setLoading] = useState(false);

  const startDate = dateRange[0].format('YYYY-MM-DD');
  const endDate = dateRange[1].format('YYYY-MM-DD');

  // DOM Ready 嵌在 load 上报里，按 load 拉取后取 data.domReady
  const querySubType = metric === 'domReady' ? 'load' : metric;

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchLatestEvents({
        appId,
        startDate,
        endDate,
        category: 'performance',
        page,
        limit: pageSize,
        subType: querySubType,
        urlKeyword: urlKeyword || undefined,
      });
      setData(result.list);
      setTotal(result.total);
    } catch (error) {
      console.error(error);
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [appId, startDate, endDate, page, pageSize, querySubType, urlKeyword]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setUrlKeyword(urlInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [urlInput]);

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: LIST_LIMIT_OPTIONS.map(String),
    showTotal: (t) => `共 ${formatNumber(t)} 条`,
    position: ['bottomCenter'],
    onChange: (nextPage, nextSize) => {
      setPage(nextPage);
      if (nextSize && nextSize !== pageSize) {
        setPageSize(nextSize as ListLimit);
        setPage(1);
      }
    },
  };

  return (
    <Card
      className="monitor-card monitor-table-card"
      size="small"
      styles={{
        header: { paddingBlock: 12 },
        body: { paddingTop: 8, paddingBottom: 8 },
      }}
      title={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            width: '100%',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            {title}
            <Badge
              count={total}
              showZero
              overflowCount={999999}
              style={{
                backgroundColor: total
                  ? token.colorPrimary
                  : token.colorTextQuaternary,
              }}
            />
          </span>

          <Space wrap size={[16, 10]} style={{ justifyContent: 'flex-end' }}>
            <Input.Search
              allowClear
              placeholder="页面关键词"
              style={{ width: 240 }}
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onSearch={(value) => {
                setUrlKeyword(value.trim());
                setPage(1);
              }}
              enterButton
            />
          </Space>
        </div>
      }
    >
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        pagination={pagination}
        scroll={{ x: '100%', y: 300 }}
        tableLayout="fixed"
        locale={{ emptyText: '暂无采样' }}
        dataSource={data}
        columns={[
          {
            title: '时间',
            dataIndex: 'timestamp',
            width: 150,
            render: (value: number) =>
              value ? dayjs(value).format('MM-DD HH:mm:ss') : '-',
          },
          {
            title: '耗时',
            key: 'value',
            width: 120,
            render: (_: unknown, record: LatestErrorItem) => {
              const value = metricValue(record, metric);
              return value == null ? '-' : `${formatNumber(value)} ms`;
            },
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
            title: '页面',
            dataIndex: 'url',
            width: 360,
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
