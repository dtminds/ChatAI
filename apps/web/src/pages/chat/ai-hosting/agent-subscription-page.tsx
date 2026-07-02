import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiHostingLayout } from "./ai-hosting-layout";

const usageTabs = [
  { label: "全部项目", value: "all" },
  { label: "Agent", value: "agent" },
  { label: "会话洞察", value: "insights" },
  { label: "其他", value: "other" },
] as const;

export function AgentSubscriptionPage() {
  return (
    <AiHostingLayout title="订阅">
      <div className="space-y-6">
        <section aria-label="当前套餐" className="space-y-4">
          <h1 className="text-[22px] font-semibold leading-tight text-foreground">订阅</h1>

          <div className="rounded-[14px] border border-border bg-background p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-4">
                  <h2 className="text-xl font-semibold text-foreground">当前计划：基础版</h2>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex h-6 items-center rounded-full bg-emerald-50 px-2.5 text-xs font-medium text-emerald-600">
                    生效中
                  </span>
                  <span>内测期内无限额，内测结束后套餐限额将进行更新</span>
                </div>
              </div>

              <Button className="h-10 rounded-[8px] px-4" disabled type="button">
                管理套餐
              </Button>
            </div>
          </div>
        </section>

        <section aria-label="积分用量" className="rounded-[14px] border border-border bg-background p-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-medium text-foreground">总积分</h2>
              <span className="shrink-0 text-sm font-medium text-foreground">剩余 100%</span>
            </div>

            <Progress aria-label="总积分使用进度" className="h-2 bg-muted" value={100} />

            <p className="text-sm text-muted-foreground">
              当前为内测期，暂不计费
            </p>
          </div>
        </section>

        <section aria-label="全部用量" className="space-y-4">
          <h2 className="text-[22px] font-semibold leading-tight text-foreground">全部用量</h2>
          <Tabs defaultValue="all">
            <TabsList className="h-11 rounded-[10px]">
              {usageTabs.map((tab) => (
                <TabsTrigger className="h-9 min-w-28 rounded-[8px] px-5" key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="overflow-hidden rounded-[8px] border border-border bg-background p-4">
            <Table aria-label="用量消耗列表">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-11 w-[30%] px-5">名称</TableHead>
                  <TableHead className="h-11 w-[15%] px-5">项目类型</TableHead>
                  <TableHead className="h-11 w-[24%] px-5">最近使用时间</TableHead>
                  <TableHead className="h-11 w-[24%] px-5">累计积分消耗</TableHead>
                  <TableHead className="h-11 w-[7%] px-5 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="px-5 py-16 text-center text-sm text-muted-foreground" colSpan={5}>
                    当前为内测期，暂不计费
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </AiHostingLayout>
  );
}
