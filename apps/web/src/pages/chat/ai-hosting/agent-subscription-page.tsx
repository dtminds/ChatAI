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

          <div className="rounded-[14px] border border-border bg-background p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-4">
                  <h2 className="text-xl font-semibold text-foreground">当前计划：团队版</h2>
                  <Button className="h-auto p-0 text-sm text-foreground" type="button" variant="link">
                    原有套餐说明
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex h-6 items-center rounded-full bg-emerald-50 px-2.5 text-xs font-medium text-emerald-600">
                    生效中
                  </span>
                  <span>套餐将于 2026.07.21 到期</span>
                </div>
              </div>

              <Button className="h-10 rounded-[8px] px-4" type="button">
                管理套餐
              </Button>
            </div>
          </div>
        </section>

        <section aria-label="订阅积分" className="rounded-[14px] border border-border bg-background p-6 shadow-sm">
          <h2 className="flex flex-wrap items-baseline gap-3 text-xl font-semibold text-foreground">
            <span>总积分</span>
            <span>142,828</span>
          </h2>

          <div className="mt-7 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.45fr)]">
            <div className="space-y-4 md:border-r md:border-border md:pr-8">
              <p className="text-sm font-medium text-foreground">订阅积分</p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-2xl font-semibold text-foreground">142,828</span>
                <span className="text-sm text-muted-foreground">/150,000</span>
                <Progress aria-label="订阅积分使用进度" className="h-2 max-w-[28rem] bg-muted" value={95} />
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-sm font-medium text-foreground">增购积分</p>
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-2xl font-semibold text-foreground">0</span>
                <Button className="h-9 rounded-[8px] px-4" type="button" variant="outline">
                  增购积分
                </Button>
              </div>
            </div>
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

          <Table aria-label="用量消耗列表">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-11 w-[30%]">名称</TableHead>
                <TableHead className="h-11 w-[15%]">项目类型</TableHead>
                <TableHead className="h-11 w-[24%]">最近使用时间</TableHead>
                <TableHead className="h-11 w-[24%]">累计积分消耗</TableHead>
                <TableHead className="h-11 w-[7%] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="py-16 text-center text-sm text-muted-foreground" colSpan={5}>
                  当前为内测期，暂不计费
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>
      </div>
    </AiHostingLayout>
  );
}
