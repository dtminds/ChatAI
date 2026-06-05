import { useEffect, useState } from "react";
import type { InsightsFollowUpsResponse } from "@chatai/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { InsightDetailPanel } from "./insight-detail-panel";
import { InsightPerson } from "./insight-person";
import { InsightsLayout, InsightsPageHeader } from "./insights-layout";
import {
  formatActionStatus,
  formatInsightTime,
} from "./insights-utils";
import { useInsightDetail } from "./use-insight-detail";

const followUpsPageSize = 10;

export function InsightsFollowUpsPage() {
  const [followUps, setFollowUps] = useState<InsightsFollowUpsResponse>();
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const detail = useInsightDetail();

  useEffect(() => {
    const controller = new AbortController();

    setIsLoading(true);

    void getInsightFollowUps(
      {
        page,
        pageSize: followUpsPageSize,
        status: "open",
      },
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
  }, [page]);

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
  const pageNumbers = buildPaginationNumbers(currentPage, totalPages);

  return (
    <InsightsLayout title="待处理">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <InsightsPageHeader
            description="集中处理风险、跟进和异常事项，状态只在洞察模块内生效"
            title="待处理"
          />
          <Badge className="mt-1" variant="outline">{total} 项</Badge>
        </div>

        <div className="rounded-[8px] border bg-background">
          <div className="overflow-x-auto">
            <Table aria-label="待处理列表">
              <TableHeader>
                <TableRow className="bg-muted/35 hover:bg-muted/35">
                  <TableHead className="h-12 min-w-[180px] px-5">客户</TableHead>
                  <TableHead className="h-12 min-w-[300px] px-5">action</TableHead>
                  <TableHead className="h-12 min-w-[90px] px-5">优先级</TableHead>
                  <TableHead className="h-12 min-w-[90px] px-5">状态</TableHead>
                  <TableHead className="h-12 min-w-[150px] px-5">时间</TableHead>
                  <TableHead className="h-12 w-[190px] px-5 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableLoadingRow />
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
                      <TableCell className="px-5 py-4">
                        <Badge variant="outline">{formatActionStatus(item.status)}</Badge>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-sm text-muted-foreground">
                        {formatInsightTime(item.createdAt)}
                      </TableCell>
                      <TableCell className="px-5 py-4">
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
                    <TableCell className="px-5 py-8 text-sm text-muted-foreground" colSpan={6}>
                      暂无待处理事项
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 ? (
            <div className="flex flex-col gap-3 border-t px-5 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                显示 {startRow}-{endRow} / 共 {total} 项
              </span>
              <div className="flex items-center gap-1">
                <Button
                  className="h-8 rounded-[8px]"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  size="sm"
                  variant="outline"
                >
                  上一页
                </Button>
                {pageNumbers.map((item, index) => item === "ellipsis" ? (
                  <span className="px-2" key={`${item}-${index}`}>...</span>
                ) : (
                  <Button
                    className="h-8 min-w-8 rounded-[8px] px-2"
                    key={item}
                    onClick={() => setPage(item)}
                    size="sm"
                    variant={item === currentPage ? "default" : "outline"}
                  >
                    {item}
                  </Button>
                ))}
                <Button
                  className="h-8 rounded-[8px]"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  size="sm"
                  variant="outline"
                >
                  下一页
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <InsightDetailPanel
        detail={detail.detail}
        isOpen={detail.isOpen}
        onOpenChange={detail.onOpenChange}
      />
    </InsightsLayout>
  );
}

function TableLoadingRow() {
  return (
    <TableRow>
      <TableCell className="py-10 text-center" colSpan={6}>
        <div
          aria-label="正在加载会话"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          <span>正在加载会话</span>
        </div>
      </TableCell>
    </TableRow>
  );
}

function buildPaginationNumbers(page: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((item) => item >= 1 && item <= totalPages));
  const sorted = Array.from(pages).sort((left, right) => left - right);
  const result: Array<number | "ellipsis"> = [];

  for (const item of sorted) {
    const previous = result.at(-1);

    if (typeof previous === "number" && item - previous > 1) {
      result.push("ellipsis");
    }

    result.push(item);
  }

  return result;
}
