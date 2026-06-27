import {
  AlertCircleIcon,
  ArrowRight01Icon,
  Calendar03Icon,
  Database01Icon,
  Edit02Icon,
  HelpCircleIcon,
  Image01Icon,
  Notification03Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AnimatedTextSwitch } from "@/components/ui/animated-text-switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  routingStrategies,
  uiComponentNames,
} from "@/pages/chat/settings/demo-data";
import { Field, PageHeader } from "@/pages/chat/settings/shared";

export function UiComponentDemoPage() {
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
    new Date(2026, 4, 7),
  );
  const [animatedTextIndex, setAnimatedTextIndex] = React.useState(0);
  const [isRuleOpen, setIsRuleOpen] = React.useState(false);
  const form = useForm({
    defaultValues: {
      templateName: "售前欢迎语",
    },
  });
  const animatedTexts = ["正在生成", "可以发送", "等待用户回复"] as const;
  const animatedText = animatedTexts[animatedTextIndex];

  return (
    <>
      <PageHeader
        description="基础组件参考页：弹窗、确认框、单选组、Tooltip、Calendar 和 Toast，方便开发设置类页面时直接复制局部结构。"
        eyebrow="DEMO / UI KIT"
        title="组件示例"
      />

      <Breadcrumb aria-label="设置路径" className="mb-5">
        <BreadcrumbList>
          <BreadcrumbItem>设置</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>开发参考</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>组件示例</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_23rem]">
        <div className="space-y-4">
          <Alert variant="destructive">
            <HugeiconsIcon
              color="currentColor"
              icon={AlertCircleIcon}
              size={16}
              strokeWidth={1.8}
            />
            <AlertTitle>同步失败：企微素材库暂时不可用</AlertTitle>
            <AlertDescription>
              可用于页面内错误、配置说明和需要保留在上下文中的提示。
            </AlertDescription>
          </Alert>

          <section className="rounded-[10px] border border-border p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  弹窗与确认流程
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  用于编辑表单、危险操作确认和需要阻断当前任务的短流程。
                </p>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="查看弹窗使用说明"
                      className="size-9 rounded-[8px]"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <HugeiconsIcon
                        color="currentColor"
                        icon={HelpCircleIcon}
                        size={17}
                        strokeWidth={1.8}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    优先用于短表单和破坏性确认
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={Edit02Icon}
                      size={17}
                      strokeWidth={1.8}
                    />
                    打开编辑弹窗
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>编辑接待策略</DialogTitle>
                    <DialogDescription>
                      典型设置表单弹窗，适合低字段量的快速编辑场景。
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-2">
                    <Field label="策略名称">
                      <Input id="strategy-name" defaultValue="接待策略" />
                    </Field>
                    <Field label="说明">
                      <Textarea
                        id="strategy-description"
                        defaultValue="按在线状态、当前负载和历史关系提示当前服务压力。"
                      />
                    </Field>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline">
                        取消
                      </Button>
                    </DialogClose>
                    <Button type="button">
                      保存
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={AlertCircleIcon}
                      size={17}
                      strokeWidth={1.8}
                    />
                    打开停用确认
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>停用接待策略</AlertDialogTitle>
                    <AlertDialogDescription>
                      停用后新会话不会再按该策略分配，已有会话不受影响。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction variant="default">确认停用</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                onClick={() => {
                  toast.success("配置已保存", {
                    description: "DEMO 中的 Toast 已接入全局 Toaster。",
                  });
                }}
                type="button"
                variant="secondary"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={Notification03Icon}
                  size={17}
                  strokeWidth={1.8}
                />
                触发 Toast
              </Button>

              <Sheet>
                <SheetTrigger asChild>
                  <Button type="button" variant="outline">
                    打开右侧抽屉
                  </Button>
                </SheetTrigger>
                <SheetContent className="sm:max-w-md">
                  <SheetHeader>
                    <SheetTitle>编辑账号详情</SheetTitle>
                    <SheetDescription>
                      Sheet 适合右侧详情、复杂编辑和不打断列表上下文的设置流程。
                    </SheetDescription>
                  </SheetHeader>
                  <div className="grid gap-4 px-6 pb-6">
                    <Field label="托管账号名称">
                      <Input id="sheet-account-name" defaultValue="护肤小助理" />
                    </Field>
                    <Field label="默认接待组">
                      <Input id="sheet-team-name" defaultValue="客服一组" />
                    </Field>
                  </div>
                  <SheetFooter>
                    <Button type="button">
                      保存变更
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            </div>
          </section>

          <section className="rounded-[10px] border border-border p-5">
            <h2 className="text-base font-semibold text-foreground">单选组模板</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              用于互斥策略、展示密度、通知等级等单选配置。
            </p>

            <RadioGroup
              aria-label="分配策略"
              className="mt-5 grid gap-3 md:grid-cols-3"
              defaultValue="load"
            >
              {routingStrategies.map((strategy) => (
                <Label
                  className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-border px-4 py-3 transition-colors hover:border-primary/40"
                  key={strategy.value}
                >
                  <RadioGroupItem className="mt-0.5" value={strategy.value} />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {strategy.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {strategy.description}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </section>

          <section className="rounded-[10px] border border-border p-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  配置表单与高级规则
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Form 负责字段说明和错误消息结构，Accordion / Collapsible 负责收纳低频配置。
                </p>

                <Form {...form}>
                  <form className="mt-5 grid gap-4" aria-label="模板配置表单">
                    <FormField
                      control={form.control}
                      name="templateName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>模板名称</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormDescription>
                            表单组件统一描述、错误消息和可访问性关联。
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Collapsible open={isRuleOpen} onOpenChange={setIsRuleOpen}>
                      <CollapsibleTrigger asChild>
                        <Button
                          aria-expanded={isRuleOpen}
                          className="w-fit rounded-[10px]"
                          type="button"
                          variant="outline"
                        >
                          高级分配规则
                          <HugeiconsIcon
                            color="currentColor"
                            icon={ArrowRight01Icon}
                            size={16}
                            strokeWidth={1.8}
                          />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3 rounded-[10px] border border-border p-4 text-sm leading-6 text-muted-foreground">
                        启用后会优先沿用最近一次服务关系。
                      </CollapsibleContent>
                    </Collapsible>
                  </form>
                </Form>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground">折叠配置组</h3>
                <Accordion className="mt-3" collapsible defaultValue="sla" type="single">
                  <AccordionItem value="sla">
                    <AccordionTrigger>响应 SLA</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      超过 90 秒未回复时转入兜底接待池。
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="quality">
                    <AccordionTrigger>质检策略</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      命中敏感词后自动创建待复核任务。
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </div>
          </section>

          <section className="rounded-[10px] border border-border p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  表格辅助组件
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Progress、Skeleton、Pagination、Slider 可覆盖导入、加载、分页和阈值配置。
                </p>
              </div>
              <HoverCard>
                <HoverCardTrigger asChild>
                  <Button type="button" variant="outline">
                    账号悬浮信息
                  </Button>
                </HoverCardTrigger>
                <HoverCardContent align="end">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10 rounded-full">
                      <AvatarFallback>梁</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold text-foreground">梁小满</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        今日接待 18 个会话
                      </p>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="rounded-[10px] border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">导入进度</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      账号绑定表正在校验 128 条记录
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-primary">68%</span>
                </div>
                <Progress className="mt-4" value={68} />
              </div>

              <div className="rounded-[10px] border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground">加载占位</h3>
                <div className="mt-4 space-y-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>

              <div className="rounded-[10px] border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground">加载指示器 (Spinner)</h3>
                <div className="mt-4 flex flex-wrap items-center gap-6">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-muted-foreground">双轨道 (默认)</span>
                    <div className="flex items-center gap-3">
                      <Spinner size={14} />
                      <Spinner size={20} className="text-primary" />
                      <Spinner size={28} className="text-success" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-muted-foreground">经典 3/4 弧</span>
                    <div className="flex items-center gap-3">
                      <Spinner variant="classic" size={14} />
                      <Spinner variant="classic" size={20} className="text-primary" />
                      <Spinner variant="classic" size={28} className="text-success" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[10px] border border-border p-4">
                <Label id="qa-sample-slider-label">质检抽样比例</Label>
                <Slider
                  aria-labelledby="qa-sample-slider-label"
                  className="mt-5"
                  defaultValue={[35]}
                  max={100}
                  step={5}
                />
              </div>

              <div className="rounded-[10px] border border-border p-4">
                <Pagination aria-label="分页">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious href="#" />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#">1</PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#" isActive>
                        2
                      </PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext href="#" />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </div>
          </section>

          <section className="rounded-[10px] border border-border p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">文字切换</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  用于 AI 状态、推荐文案和输入提示：旧文案快速淡出，新文案逐字进入，稳定后可开启扫光效果。
                </p>
              </div>
              <Button
                onClick={() => {
                  setAnimatedTextIndex(
                    (animatedTextIndex + 1) % animatedTexts.length,
                  );
                }}
                type="button"
                variant="outline"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={SparklesIcon}
                  size={17}
                  strokeWidth={1.8}
                />
                切换文案
              </Button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-[10px] border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground">带扫光</h3>
                <div className="mt-4 inline-flex min-h-10 items-center rounded-full border border-border bg-background px-4 text-sm font-medium shadow-[0_10px_24px_var(--shadow-soft)]">
                  <AnimatedTextSwitch
                    aria-label="文字切换示例"
                    shiny
                    shinyDuration={1.15}
                    shinyShimmerWidth={48}
                    value={animatedText}
                  />
                </div>
              </div>

              <div className="rounded-[10px] border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground">纯切换</h3>
                <div className="mt-4 inline-flex min-h-10 items-center rounded-full border border-border bg-background px-4 text-sm font-medium text-muted-foreground shadow-[0_10px_24px_var(--shadow-soft)]">
                  <AnimatedTextSwitch value={animatedText} />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[10px] border border-border p-5">
            <h2 className="text-base font-semibold text-foreground">工作台分栏参考</h2>
            <ResizablePanelGroup
              className="mt-5 min-h-[180px] rounded-[10px] border border-border"
              orientation="horizontal"
            >
              <ResizablePanel defaultSize={34} minSize={25}>
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  会话列表
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={66} minSize={35}>
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  聊天详情 / 客户资料
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[10px] border border-border p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
                <HugeiconsIcon
                  color="currentColor"
                  icon={Calendar03Icon}
                  size={18}
                  strokeWidth={1.8}
                />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">日期选择</h2>
                <p className="mt-1 text-xs text-muted-foreground">Calendar 单选示例</p>
              </div>
            </div>

            <Label className="sr-only" id="schedule-date-label">
              排班日期
            </Label>
            <div
              aria-labelledby="schedule-date-label"
              className="mt-4 overflow-x-auto rounded-[10px] border border-border"
              role="group"
            >
              <Calendar
                mode="single"
                onSelect={setSelectedDate}
                selected={selectedDate}
              />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              当前日期：
              <span className="font-medium text-foreground">
                {selectedDate?.toLocaleDateString("zh-CN") ?? "未选择"}
              </span>
            </p>
          </section>

          <section className="rounded-[10px] border border-border p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
                <HugeiconsIcon
                  color="currentColor"
                  icon={Image01Icon}
                  size={18}
                  strokeWidth={1.8}
                />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">媒体比例预览</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  AspectRatio 可用真实宽高避免消息流跳动
                </p>
              </div>
            </div>

            <div
              aria-label="媒体比例预览"
              className="mt-4 rounded-[10px] border border-border p-3"
              role="group"
            >
              <AspectRatio ratio={4 / 3}>
                <div className="flex h-full items-center justify-center rounded-[8px] border border-dashed border-border text-muted-foreground">
                  <HugeiconsIcon
                    color="currentColor"
                    icon={Image01Icon}
                    size={28}
                    strokeWidth={1.8}
                  />
                </div>
              </AspectRatio>
            </div>
          </section>

          <section className="rounded-[10px] border border-border p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-[10px] bg-success-muted text-success">
                <HugeiconsIcon
                  color="currentColor"
                  icon={Database01Icon}
                  size={18}
                  strokeWidth={1.8}
                />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">已补充组件</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  统一放在 apps/web/src/components/ui
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {uiComponentNames.map((component) => (
                <Badge key={component} variant="outline">
                  {component}
                </Badge>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </>
  );
}
