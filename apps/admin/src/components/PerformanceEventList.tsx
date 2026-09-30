import { useEffect, useRef, useState } from 'react';
import { Badge, Card, Input, Space, Table, Typography, theme } from 'antd';
import type { TablePaginationConfig } from 'antd';
import type { SorterResult } from 'antd/es/table/interface';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { fetchLatestEvents } from '@/lib/api';
import type { LatestErrorItem } from '@/lib/types';
import { useFilterStore } from '@/stores/filterStore';
import {
  LIST_LIMIT_OPTIONS,
  type ListLimit,
} from '@/components/LatestErrorList';
import { formatDuration, formatNumber } from '@/lib/format';
import { queryKeys } from '@/lib/queryClient';

interface PerformanceEventListProps {
  title: string;
  /** performance 事件的 sub_type：fcp | lcp | load | domReady */
  metric: 'fcp' | 'lcp' | 'load' | 'domReady';
}

type SortBy = 'timestamp' | 'value' | 'domReady';
type SortOrder = 'ascend' | 'descend';

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

export function PerformanceEventList({
  title,
  metric,
}: PerformanceEventListProps) {
  const { token } = theme.useToken();
  const appId = useFilterStore((s) => s.appId);
  const dateRange = useFilterStore((s) => s.dateRange);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ListLimit>(50);
  const [pageCursors, setPageCursors] = useState<
    Array<{ cursorTs: number; cursorId: number } | null>
  >([null]);
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [urlKeyword, setUrlKeyword] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('timestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('descend');

  const startDate = dateRange[0].format('YYYY-MM-DD');
  const endDate = dateRange[1].format('YYYY-MM-DD');

  const querySubType = metric === 'domReady' ? 'load' : metric;
  const valueSortBy: SortBy = metric === 'domReady' ? 'domReady' : 'value';

  const resetPaging = () => {
    setPage(1);
    setPageCursors([null]);
  };

  const canKeyset = sortBy === 'timestamp';
  const cursor =
    canKeyset && page > 1 ? pageCursorsRef.current[page - 1] : null;

  const { data: listResult, isFetching } = useQuery({
    queryKey: queryKeys.events({
      appId,
      startDate,
      endDate,
      category: 'performance',
      page,
      pageSize,
      subType: querySubType,
      urlKeyword: urlKeyword || null,
      sortBy,
      sortOrder,
      cursorTs: cursor?.cursorTs ?? null,
      cursorId: cursor?.cursorId ?? null,
    }),
    queryFn: async () => {
      try {
        return await fetchLatestEvents({
          appId,
          startDate,
          endDate,
          category: 'performance',
          page,
          limit: pageSize,
          subType: querySubType,
          urlKeyword: urlKeyword || undefined,
          sortBy,
          sortOrder,
          ...(cursor
            ? { cursorTs: cursor.cursorTs, cursorId: cursor.cursorId }
            : {}),
        });
      } catch (error) {
        console.error(error);
        return {
          category: 'performance' as const,
          page,
          limit: pageSize,
          total: 0,
          list: [] as LatestErrorItem[],
          nextCursor: null,
        };
      }
    },
  });

  useEffect(() => {
    if (!canKeyset || !listResult?.nextCursor) return;
    setPageCursors((prev) => {
      const next = prev.slice();
      while (next.length < page) next.push(null);
      next[page] = listResult.nextCursor!;
      return next;
    });
  }, [canKeyset, listResult?.nextCursor, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setUrlKeyword(urlInput.trim());
      resetPaging();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [urlInput]);

  const data = listResult?.list ?? [];
  const total = listResult?.total ?? 0;

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: LIST_LIMIT_OPTIONS.map(String),
    showTotal: (t) => `共 ${formatNumber(t)} 条`,
    position: ['bottomCenter'],
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
                resetPaging();
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
        loading={isFetching}
        pagination={pagination}
        scroll={{ x: '100%', y: 300 }}
        tableLayout="fixed"
        locale={{ emptyText: '暂无采样' }}
        dataSource={data}
        onChange={(nextPagination, _filters, sorter, extra) => {
          if (extra.action === 'sort') {
            const single = (
              Array.isArray(sorter) ? sorter[0] : sorter
            ) as SorterResult<LatestErrorItem>;
            if (!single?.order || single.columnKey !== 'value') {
              setSortBy('timestamp');
              setSortOrder('descend');
            } else {
              setSortBy(valueSortBy);
              setSortOrder(single.order);
            }
            resetPaging();
            return;
          }

          if (extra.action === 'paginate') {
            const nextSize = nextPagination.pageSize;
            const nextPage = nextPagination.current || 1;
            if (nextSize && nextSize !== pageSize) {
              setPageSize(nextSize as ListLimit);
              resetPaging();
            } else {
              setPage(nextPage);
            }
          }
        }}
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
            width: 140,
            sorter: true,
            sortDirections: ['descend', 'ascend'],
            sortOrder: sortBy === valueSortBy ? sortOrder : null,
            render: (_: unknown, record: LatestErrorItem) => {
              const value = metricValue(record, metric);
              return formatDuration(value);
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
