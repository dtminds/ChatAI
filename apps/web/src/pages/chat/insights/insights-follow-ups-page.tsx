import { useEffect, useState } from "react";
import type { InsightsFollowUpsResponse } from "@chatai/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getInsightFollowUps,
  updateInsightActionStatus,
} from "./api/insights-service";
import { PriorityBadge } from "./insight-badges";
import { InsightDateRangeFilter } from "./insight-date-range-filter";
import { InsightDetailPanel } from "./insight-detail-panel";
import { InsightPerson } from "./insight-person";
import { InsightsLayout, InsightsPageHeader } from "./insights-layout";
import {
  toBoundaryDate,
  type InsightDateRange,
} from "./insights-date-range";
import {
  formatActionStatus,
  formatInsightTime,
  formatPriority,
} from "./insights-utils";
import { InsightTableLoadingRow } from "./insight-table-loading-row";
import { InsightTablePagination } from "./insight-table-pagination";
import { useInsightDetail } from "./use-insight-detail";

const followUpsPageSize = 10;
type PriorityFilter = "high" | "low" | "medium";
type StatusFilter = "open" | "processed";

const priorityFilterOptions: Array<{ label: string; value: PriorityFilter | "none" }> = [
  { label: "全部优先级", value: "none" },
  { label: formatPriority("high"), value: "high" },
  { label: formatPriority("medium"), value: "medium" },
  { label: formatPriority("low"), value: "low" },
];

export function InsightsFollowUpsPage() {
  const [followUps, setFollowUps] = useState<InsightsFollowUpsResponse>();
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<InsightDateRange>();
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const detail = useInsightDetail();

  useEffect(() => {
    const controller = new AbortController();

    setIsLoading(true);

    const query = {
      ...(dateRange ? {
        from: toBoundaryDate(dateRange.from, "start"),
        to: toBoundaryDate(dateRange.to, "end"),
      } : {}),
      page,
      pageSize: followUpsPageSize,
      ...(priorityFilter ? { priority: priorityFilter } : {}),
      status: statusFilter,
    };

    void getInsightFollowUps(
      query,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setFollowUps(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [dateRange, page, priorityFilter, statusFilter]);

  async function updateStatus(actionItemId: string, status: "dismissed" | "done") {
    await updateInsightActionStatus(actionItemId, status);
    setFollowUps((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.actionItemId === actionItemId ? { ...item, status } : item,
            ),
            total: status === "done" || status === "dismissed"
              ? Math.max(0, current.total - 1)
              : current.total,
          }
        : current,
    );
  }

  const total = followUps?.total ?? 0;
  const currentPage = followUps?.page ?? page;
  const pageSize = followUps?.pageSize ?? followUpsPageSize;
  const totalPages = followUps?.totalPages ?? 1;
  const startRow = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(total, currentPage * pageSize);

  return (
    <InsightsLayout title="待处理">
      <div className="space-y-5">
        <InsightsPageHeader
          description="集中处理风险、跟进和异常事项，状态只在洞察模块内生效"
          title="待处理"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            onValueChange={(value) => {
              setStatusFilter(value as StatusFilter);
              setPage(1);
            }}
            value={statusFilter}
          >
            <TabsList className="h-10 rounded-[8px] bg-muted p-1">
              <TabsTrigger className="h-8 min-w-20 rounded-[6px] px-4 py-0 text-sm" value="open">
                待处理
              </TabsTrigger>
              <TabsTrigger className="h-8 min-w-20 rounded-[6px] px-4 py-0 text-sm" value="processed">
                已处理
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <InsightDateRangeFilter
            allowEmpty
            from={dateRange?.from}
            onChange={(range) => {
              setDateRange(range);
              setPage(1);
            }}
            to={dateRange?.to}
          />
          <FilterSelect
            label="优先级"
            onValueChange={(value) => {
              setPriorityFilter(value === "none" ? undefined : value as PriorityFilter);
              setPage(1);
            }}
            options={priorityFilterOptions}
            placeholder="选择优先级"
            value={priorityFilter}
            widthClassName="w-[132px]"
          />
        </div>

        <div className="bg-background">
          <div className="overflow-x-auto">
            <Table aria-label="待处理列表">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-12 min-w-[180px] px-5">客户</TableHead>
                  <TableHead className="h-12 min-w-[300px] px-5">概要</TableHead>
                  <TableHead className="h-12 min-w-[90px] px-5">优先级</TableHead>
                  <TableHead className="h-12 min-w-[112px] px-5">状态</TableHead>
                  <TableHead className="h-12 min-w-[150px] px-5">时间</TableHead>
                  <TableHead className="h-12 min-w-[190px] px-5 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <InsightTableLoadingRow colSpan={6} />
                ) : (followUps?.items ?? []).length > 0 ? (
                  (followUps?.items ?? []).map((item) => (
                    <TableRow key={item.actionItemId}>
                      <TableCell className="px-5 py-4">
                        <InsightPerson
                          avatarUrl={item.customerAvatarUrl}
                          name={item.customerName}
                        />
                      </TableCell>
                      <TableCell className="max-w-[360px] px-5 py-4">
                        <div className="truncate text-sm font-medium text-foreground">
                          {item.title}
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <PriorityBadge priority={item.priority} />
                      </TableCell>
                      <TableCell className="min-w-[112px] px-5 py-4">
                        <Badge className="whitespace-nowrap" variant="outline">{formatActionStatus(item.status)}</Badge>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-sm text-muted-foreground">
                        {formatInsightTime(item.createdAt)}
                      </TableCell>
                      <TableCell className="min-w-[190px] px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            className="h-8 rounded-[8px]"
                            onClick={() => void detail.openDetail(item.sessionId)}
                            size="sm"
                            variant="outline"
                          >
                            详情
                          </Button>
                          <Button
                            className="h-8 rounded-[8px]"
                            disabled={item.status !== "open"}
                            onClick={() => void updateStatus(item.actionItemId, "done")}
                            size="sm"
                          >
                            标记完成
                          </Button>
                          <Button
                            className="h-8 rounded-[8px]"
                            disabled={item.status !== "open"}
                            onClick={() => void updateStatus(item.actionItemId, "dismissed")}
                            size="sm"
                            variant="ghost"
                          >
                            忽略
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell className="px-5 py-8 text-center text-sm text-muted-foreground" colSpan={6}>
                      暂无数据
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <InsightTablePagination
            className="px-5"
            endRow={endRow}
            itemLabel="项"
            onPageChange={setPage}
            page={currentPage}
            startRow={startRow}
            total={total}
            totalPages={totalPages}
          />
        </div>
      </div>

      <InsightDetailPanel
        detail={detail.detail}
        error={detail.error}
        isOpen={detail.isOpen}
        isLoading={detail.isLoading}
        onOpenChange={detail.onOpenChange}
      />
    </InsightsLayout>
  );
}

function FilterSelect({
  label,
  onValueChange,
  options,
  placeholder,
  value,
  widthClassName,
}: {
  label: string;
  onValueChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
  value: string | undefined;
  widthClassName: string;
}) {
  return (
    <Select onValueChange={onValueChange} value={value ?? ""}>
      <SelectTrigger aria-label={label} className={`h-9 rounded-[8px] ${widthClassName}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
