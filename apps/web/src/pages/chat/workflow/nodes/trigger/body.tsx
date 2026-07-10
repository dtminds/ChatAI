import type { NodeBodyProps } from "../types";

export function TriggerNodeBody({ data }: NodeBodyProps<"trigger">) {
  return (
    <span className="mx-3 mb-3.5 block px-2 pb-0.5">
      <span className="grid gap-2">
        <StartNodeLine label="托管账号" value={data.hostingAccountSummary ?? "已选 4 个托管账号"} />
        <StartNodeLine label="目标人群" value={data.audience ?? "添加标签、添加好友事件、用户输入"} />
        <StartNodeLine label="限制次数" value={data.entryLimitSummary ?? "同一客户进入此SOP最多2次"} />
        <StartNodeLine label="发送时段" value={data.sendWindow ?? "09:00:00 - 18:00:00"} />
      </span>
    </span>
  );
}

function StartNodeLine({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <span className="flex min-w-0 gap-1 text-xs leading-[18px] text-[var(--workflow-text-tertiary)]">
      <span>{label}：</span>
      <span className="min-w-0 truncate font-medium text-foreground">{String(value)}</span>
    </span>
  );
}
