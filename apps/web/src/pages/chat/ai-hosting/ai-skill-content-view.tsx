import { cn } from "@/lib/utils";
import { parseSkillContentSegments } from "./ai-skill-resource";
import "./agent-module.css";

/** 与编辑器 chip 对齐的只读蓝色资源块样式 */
const skillResourceChipClassName =
  "ai-skill-resource-chip mx-0.5 inline-block h-[22px] translate-y-[-1px] rounded-[6px] px-1.5 align-baseline text-[13px] font-normal leading-[22px]";

/**
 * 只读渲染技能描述：纯文本保留换行，`<resource ... />` 显示为蓝色区块。
 */
export function SkillContentView({
  className,
  content,
  emptyText = "暂无数据",
}: {
  className?: string;
  content: string;
  emptyText?: string;
}) {
  if (!content.trim()) {
    return <p className={cn("text-sm leading-6 text-muted-foreground", className)}>{emptyText}</p>;
  }

  const segments = parseSkillContentSegments(content);

  return (
    <p className={cn("whitespace-pre-wrap text-sm leading-6 text-muted-foreground", className)}>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <span key={`text-${index}`}>{segment.value}</span>;
        }

        return (
          <span
            className={skillResourceChipClassName}
            data-skill-resource-chip="true"
            data-skill-resource-kind={segment.kind}
            key={`${segment.kind}-${segment.id}-${index}`}
          >
            {segment.name}
          </span>
        );
      })}
    </p>
  );
}
