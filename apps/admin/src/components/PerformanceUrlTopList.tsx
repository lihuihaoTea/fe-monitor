import { Card, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { PerfUrlRow } from "@/lib/types";
import { formatDuration, formatNumber } from "@/lib/format";

interface PerformanceUrlTopListProps {
  title: string;
  data: PerfUrlRow[];
  loading?: boolean;
}

export function PerformanceUrlTopList({
  title,
  data,
  loading,
}: PerformanceUrlTopListProps) {
  const total = data.length;

  const columns: ColumnsType<PerfUrlRow> = [
    {
      title: "页面",
      dataIndex: "url",
      ellipsis: true,
      render: (value: string) => (
        <Typography.Text
          copyable={{ text: value }}
          ellipsis={{ tooltip: value }}
        >
          {value || "-"}
        </Typography.Text>
      ),
    },
    {
      title: "平均",
      dataIndex: "avg",
      width: 120,
      align: "center",
      sorter: (a, b) => a.avg - b.avg,
      defaultSortOrder: "descend",
      render: (value: number) => formatDuration(value),
    },
    {
      title: "最小",
      dataIndex: "min",
      width: 120,
      align: "center",
      render: (value: number) => formatDuration(value),
    },
    {
      title: "最大",
      dataIndex: "max",
      width: 120,
      align: "center",
      render: (value: number) => formatDuration(value),
    },
    {
      title: "样本",
      dataIndex: "count",
      width: 120,
      align: "center",
      sorter: (a, b) => a.count - b.count,
      render: (value: number) => formatNumber(value),
    },
  ];

  return (
    <Card
      className="monitor-card monitor-table-card"
      size="small"
      title={`${title}（共 ${formatNumber(total)} 条）`}
      styles={{
        header: { paddingBlock: 12 },
        body: { paddingTop: 8, paddingBottom: 8 },
      }}
    >
      <Table
        rowKey="url"
        size="small"
        loading={loading}
        pagination={false}
        scroll={{ x: "100%", y: 320 }}
        tableLayout="fixed"
        locale={{ emptyText: "暂无页面数据" }}
        dataSource={data}
        columns={columns}
      />
    </Card>
  );
}
