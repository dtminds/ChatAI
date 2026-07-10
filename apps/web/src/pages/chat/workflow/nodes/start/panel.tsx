import {
  Clock01Icon,
  Delete02Icon,
  HelpCircleIcon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { NodeSettingsProps } from "../../panels/types";

export function StartConfig({ node }: NodeSettingsProps<"start">) {
  const sendWindow = typeof node.data.sendWindow === "string"
    ? node.data.sendWindow
    : "09:00:00 - 18:00:00";
  const [sendStartTime, sendEndTime] = sendWindow.split(" - ");

  return (
    <Accordion
      className="-mx-1 -mt-1"
      defaultValue={["hosting", "audience", "limit", "send-window"]}
      type="multiple"
    >
      <AccordionItem className="border-b-0" value="hosting">
        <AccordionTrigger className="items-center rounded-[10px] px-1 py-3 text-[15px] font-semibold text-foreground">
          <span className="flex min-w-0 items-center gap-2">
            托管账号
            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-destructive">
              <HugeiconsIcon icon={InformationCircleIcon} size={14} strokeWidth={2} />
              消息发送时，必须保持托管账号在线
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-3">
          <Button className="w-full justify-start rounded-[10px] text-primary" type="button" variant="outline">
            选择托管账号
          </Button>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem className="border-b-0" value="audience">
        <AccordionTrigger className="items-center rounded-[10px] px-1 py-3 text-[15px] font-semibold text-foreground">目标人群</AccordionTrigger>
        <AccordionContent className="pb-3">
          <div className="rounded-[10px] border border-[var(--workflow-border)] bg-[var(--workflow-panel-bg)] p-3">
            <p className="mb-2.5 text-[13px] font-medium text-muted-foreground">筛选方式</p>
            <RadioGroup
              className="mb-[18px] flex flex-row gap-5"
              defaultValue="event"
            >
              <label className="flex min-w-0 items-center gap-2 text-[13px] leading-5 text-foreground">
                <RadioGroupItem value="event" />
                <span>按事件筛选</span>
              </label>
              <label className="flex min-w-0 items-center gap-2 text-[13px] leading-5 text-foreground">
                <RadioGroupItem value="customer" />
                <span>按指定客户筛选</span>
              </label>
            </RadioGroup>

            <div className="rounded-[10px] bg-[var(--workflow-panel-section)] p-3">
              <p className="mb-2.5 text-[13px] font-medium text-muted-foreground">
                <span className="text-destructive">*</span>
                事件
              </p>
              <StartEventOption label="添加标签" withSelector />
              <StartEventOption label="添加好友" />
              <StartEventOption label="用户输入" />
              <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2">
                <span>1</span>
                <Input
                  aria-label="用户输入关键词"
                  placeholder="输入后按下Enter或添加按钮"
                  readOnly
                  value=""
                />
                <span className="text-xs text-muted-foreground">0 / 20</span>
                <Button aria-label="删除关键词" size="icon" type="button" variant="ghost">
                  <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.8} />
                </Button>
              </div>
              <Button className="mt-3 w-full" type="button" variant="outline">
                + 添加项(0/10)
              </Button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem className="border-b-0" value="limit">
        <AccordionTrigger className="items-center rounded-[10px] px-1 py-3 text-[15px] font-semibold text-foreground">
          <span className="flex min-w-0 items-center gap-2">
            限制次数
            <HugeiconsIcon className="text-muted-foreground" icon={HelpCircleIcon} size={15} strokeWidth={1.8} />
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-3">
          <div className="rounded-[10px] border border-[var(--workflow-border)] bg-[var(--workflow-panel-bg)] p-3">
            <RadioGroup className="gap-3.5" defaultValue="limited">
              <label className="flex min-w-0 items-center gap-2 text-[13px] leading-5 text-foreground">
                <RadioGroupItem value="unlimited" />
                <span>不限次数</span>
              </label>
              <label className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] leading-5 text-foreground">
                <RadioGroupItem value="limited" />
                <span>同一客户进入此SOP最多</span>
                <Input
                  aria-label="进入次数限制"
                  className="h-8 w-[82px]"
                  readOnly
                  value="2"
                />
                <span>次</span>
              </label>
            </RadioGroup>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem className="border-b-0" value="send-window">
        <AccordionTrigger className="items-center rounded-[10px] px-1 py-3 text-[15px] font-semibold text-foreground">消息发送时段</AccordionTrigger>
        <AccordionContent className="pb-3">
          <div className="inline-flex items-center gap-3.5 rounded-lg border border-[var(--workflow-border)] bg-[var(--workflow-panel-bg)] px-3 py-2 text-[13px]">
            <span>{sendStartTime}</span>
            <span>→</span>
            <span>{sendEndTime}</span>
            <HugeiconsIcon className="text-muted-foreground" icon={Clock01Icon} size={16} strokeWidth={1.8} />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function StartEventOption({
  label,
  withSelector,
}: {
  label: string;
  withSelector?: boolean;
}) {
  return (
    <div className="mt-3 min-w-0 first:mt-0">
      <div className="flex min-w-0 items-center gap-2 text-[13px] leading-5 text-foreground">
        <Checkbox checked onCheckedChange={() => undefined} />
        <span>{label}</span>
        <HugeiconsIcon className="text-muted-foreground" icon={HelpCircleIcon} size={15} strokeWidth={1.8} />
      </div>
      {withSelector ? (
        <Button className="mt-3 h-10 w-full justify-start rounded-[10px] bg-[var(--workflow-panel-bg)] px-3 text-primary hover:bg-[var(--workflow-panel-bg)] hover:text-primary" type="button" variant="ghost">
          选择标签
        </Button>
      ) : null}
    </div>
  );
}
