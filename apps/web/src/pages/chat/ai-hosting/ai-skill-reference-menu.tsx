import { useEffect, useMemo, useState } from "react";
import {
  AbsoluteIcon,
  AiBookIcon,
  ApiIcon,
  ResourcesAddIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getSkillResourceChipName,
  type SkillResourceItem,
} from "./ai-skill-resource";

export function AiSkillReferenceMenu({
  disabled = false,
  knowledgeBases,
  onSelectResource,
  tools,
  variables,
}: {
  disabled?: boolean;
  knowledgeBases: readonly SkillResourceItem[];
  onSelectResource: (item: SkillResourceItem) => void;
  tools: readonly SkillResourceItem[];
  variables: readonly SkillResourceItem[];
}) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(
    () => [
      {
        icon: AbsoluteIcon,
        items: variables.filter((item) => item.status === "available"),
        title: "变量",
      },
      {
        icon: ApiIcon,
        items: tools.filter((item) => item.status === "available"),
        title: "工具",
      },
      {
        icon: AiBookIcon,
        items: knowledgeBases.filter((item) => item.status === "available"),
        title: "知识库",
      },
    ],
    [knowledgeBases, tools, variables],
  );
  const visibleGroups = groups.filter((group) => group.items.length > 0);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  return (
    <Popover modal={false} onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          aria-label="添加引用资源"
          className="size-6 rounded-[6px] p-0 text-muted-foreground"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon icon={ResourcesAddIcon} size={14} strokeWidth={1.8} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[260px] max-w-[min(260px,calc(100vw-2rem))] overflow-hidden rounded-[8px] p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        sideOffset={8}
      >
        <ScrollArea
          className="w-full min-w-0 max-w-full [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:w-full [&_[data-slot=scroll-area-viewport]>div]:min-w-0 [&_[data-slot=scroll-area-viewport]>div]:max-w-full"
          type="always"
          viewportProps={{ className: "!h-auto max-h-72" }}
        >
          <div aria-label="选择引用资源" role="listbox">
            {visibleGroups.map((group, index) => (
              <section
                className={index > 0 ? "border-t border-border/70" : undefined}
                key={group.title}
              >
                <h3 className="px-3 pb-1 pt-2.5 text-xs font-normal text-muted-foreground/60">
                  {group.title}
                </h3>
                <div className="px-1 pb-1">
                  {group.items.map((item) => {
                    const displayName = getSkillResourceChipName(item);

                    return (
                      <button
                        aria-label={displayName}
                        className="flex w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-[6px] px-2 py-1.5 text-left text-[13px] text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
                        key={item.id}
                        onClick={() => {
                          onSelectResource(item);
                          setOpen(false);
                        }}
                        onMouseDown={(event) => event.preventDefault()}
                        role="option"
                        type="button"
                      >
                        <HugeiconsIcon
                          className="shrink-0 text-muted-foreground"
                          icon={group.icon}
                          size={15}
                          strokeWidth={1.8}
                        />
                        <span className="min-w-0 flex-1 truncate" title={displayName}>
                          {displayName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {visibleGroups.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                请先在资源管理中添加变量、工具或知识库
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
