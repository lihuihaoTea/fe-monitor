import { Card, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { PvPageRow } from "@/lib/types";
import { formatNumber } from "@/lib/format";

interface PvPagesListProps {
  title: string;
  data: PvPageRow[];
  loading?: boolean;
  /** 默认按 PV 降序（Top）；最低页传 ascend */
  sort?: "descend" | "ascend";
}

export function PvPagesList({
  title,
  data,
  loading,
  sort = "descend",
}: PvPagesListProps) {
  const total = data.length;

  const columns: ColumnsType<PvPageRow> = [
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
      title: "访问量 (PV)",
      dataIndex: "pv",
      width: 120,
      align: "center",
      sorter: (a, b) => a.pv - b.pv,
      defaultSortOrder: sort,
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
