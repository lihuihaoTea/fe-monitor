import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Card,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  theme,
} from 'antd';
import type { TablePaginationConfig } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { fetchEventSubTypes, fetchLatestEvents } from '@/lib/api';
import type {
  EventCategory,
  LatestErrorItem,
} from '@/lib/types';
import { useFilterStore } from '@/stores/filterStore';
import { formatNumber } from '@/lib/format';
import { queryKeys } from '@/lib/queryClient';

export const LIST_LIMIT_OPTIONS = [20, 50, 100, 200] as const;
export type ListLimit = (typeof LIST_LIMIT_OPTIONS)[number];

interface LatestErrorListProps {
  title: string;
  category: EventCategory;
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

export function LatestErrorList({ title, category }: LatestErrorListProps) {
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
  const [subType, setSubType] = useState<string | undefined>();
  const [messageKeyword, setMessageKeyword] = useState('');
  const [urlKeyword, setUrlKeyword] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [urlInput, setUrlInput] = useState('');

  const startDate = dateRange[0].format('YYYY-MM-DD');
  const endDate = dateRange[1].format('YYYY-MM-DD');

  const resetPaging = () => {
    setPage(1);
    setPageCursors([null]);
  };

  const { data: typeOptions = [] } = useQuery({
    queryKey: queryKeys.eventSubTypes(appId, startDate, endDate, category),
    queryFn: async () => {
      try {
        return await fetchEventSubTypes({
          appId,
          startDate,
          endDate,
          category,
        });
      } catch (error) {
        console.error(error);
        return [];
      }
    },
  });

  const cursor = page > 1 ? pageCursorsRef.current[page - 1] : null;

  const { data: listResult, isFetching } = useQuery({
    queryKey: queryKeys.events({
      appId,
      startDate,
      endDate,
      category,
      page,
      pageSize,
      subType: subType || null,
      messageKeyword: messageKeyword || null,
      urlKeyword: urlKeyword || null,
      cursorTs: cursor?.cursorTs ?? null,
      cursorId: cursor?.cursorId ?? null,
    }),
    queryFn: async () => {
      try {
        return await fetchLatestEvents({
          appId,
          startDate,
          endDate,
          category,
          page,
          limit: pageSize,
          subType,
          messageKeyword: messageKeyword || undefined,
          urlKeyword: urlKeyword || undefined,
          ...(cursor
            ? { cursorTs: cursor.cursorTs, cursorId: cursor.cursorId }
            : {}),
        });
      } catch (error) {
        console.error(error);
        return {
          category,
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
    if (!listResult?.nextCursor) return;
    setPageCursors((prev) => {
      const next = prev.slice();
      while (next.length < page) next.push(null);
      next[page] = listResult.nextCursor!;
      return next;
    });
  }, [listResult?.nextCursor, page]);

  // 关键词输入防抖；变更时回到第 1 页
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMessageKeyword(messageInput.trim());
      setUrlKeyword(urlInput.trim());
      resetPaging();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [messageInput, urlInput]);

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
    onChange: (nextPage, nextSize) => {
      if (nextSize && nextSize !== pageSize) {
        setPageSize(nextSize as ListLimit);
        resetPaging();
      } else {
        setPage(nextPage);
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
            <Select
              allowClear
              placeholder="类型筛选"
              style={{ width: 160 }}
              value={subType}
              options={typeOptions}
              onChange={(value) => {
                setSubType(value);
                resetPaging();
              }}
            />
            <Input.Search
              allowClear
              placeholder="信息关键词"
              style={{ width: 220 }}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onSearch={(value) => {
                setMessageKeyword(value.trim());
                resetPaging();
              }}
              enterButton
            />
            <Input.Search
              allowClear
              placeholder="页面关键词"
              style={{ width: 220 }}
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
        locale={{ emptyText: '暂无报错' }}
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
