import { useId, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import type { WorkflowManagedAccountResourceStatus } from "../../workflow-managed-account-resource";
import type { WorkflowStartOption } from "./fixture-options";

export function ManagedAccountSelection({
  onRetry,
  onToggle,
  options,
  selectedIds,
  status,
}: {
  onRetry?: () => void;
  onToggle(id: number, checked: boolean): void;
  options: WorkflowStartOption[];
  selectedIds: number[];
  status: WorkflowManagedAccountResourceStatus;
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputId = useId();
  const pickerAnchorRef = useRef<HTMLDivElement | null>(null);
  const selectedIdSet = new Set(selectedIds);
  const optionsById = new Map(options.map(option => [option.id, option] as const));
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter(option => option.label.toLowerCase().includes(normalizedQuery))
    : options;
  const selectedOptions = selectedIds.map(id => optionsById.get(id) ?? {
    id,
    label: status === "ready" ? "已失效的托管账号" : "托管账号",
  });

  return (
    <div className="space-y-3">
      {status === "error" ? (
        <div className="flex min-h-10 items-center justify-between gap-2 rounded-[10px] bg-secondary px-3.5 text-[13px] text-muted-foreground">
          <span>操作失败，请稍后重试</span>
          {onRetry ? (
            <Button onClick={onRetry} size="sm" type="button" variant="ghost">
              重试
            </Button>
          ) : null}
        </div>
      ) : status === "loading" || status === "idle" ? (
        <div
          className="flex min-h-10 items-center gap-2 rounded-[10px] bg-secondary px-3.5 text-[13px] text-muted-foreground"
          role="status"
        >
          <Spinner />
          <span>正在加载</span>
        </div>
      ) : (
        <Popover modal={false} onOpenChange={setIsPickerOpen} open={isPickerOpen}>
          <PopoverAnchor asChild>
            <div ref={pickerAnchorRef}>
              <Input
                aria-label="搜索并选择托管账号"
                id={searchInputId}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setIsPickerOpen(true);
                }}
                onFocus={() => setIsPickerOpen(true)}
                placeholder="搜索并选择托管账号"
                value={query}
              />
            </div>
          </PopoverAnchor>
          <PopoverContent
            align="start"
            className="w-[var(--radix-popper-anchor-width)] rounded-[8px] p-2"
            onCloseAutoFocus={event => event.preventDefault()}
            onInteractOutside={(event) => {
              const target = event.target;

              if (target instanceof Node && pickerAnchorRef.current?.contains(target)) {
                event.preventDefault();
              }
            }}
            onOpenAutoFocus={event => event.preventDefault()}
            sideOffset={8}
          >
            {options.length > 0 ? (
              <ScrollArea className="h-[15rem]">
                <div className="space-y-1 pr-2">
                  {filteredOptions.length > 0 ? filteredOptions.map(option => (
                    <label
                      className="flex h-10 cursor-pointer items-center gap-2 rounded-[8px] px-2.5 text-[13px] text-foreground hover:bg-surface-hover"
                      key={option.id}
                    >
                      <Checkbox
                        aria-label={option.label}
                        checked={selectedIdSet.has(option.id)}
                        onCheckedChange={value => onToggle(option.id, value === true)}
                      />
                      <ManagedAccountAvatar option={option} />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    </label>
                  )) : (
                    <p className="px-2.5 py-8 text-center text-[13px] text-muted-foreground">
                      未找到匹配账号
                    </p>
                  )}
                </div>
              </ScrollArea>
            ) : (
              <p className="px-2.5 py-8 text-center text-[13px] text-muted-foreground">
                暂无可用托管账号
              </p>
            )}
          </PopoverContent>
        </Popover>
      )}

      {selectedOptions.length > 0 ? (
        <ScrollArea className="h-[9rem] rounded-[8px] border border-dashed border-border">
          <div className="space-y-1 p-2">
            {selectedOptions.map(option => (
              <div
                className="flex h-10 items-center gap-2 rounded-[8px] px-1.5 text-[13px] text-foreground"
                key={option.id}
              >
                <ManagedAccountAvatar option={option} />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <Button
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => onToggle(option.id, false)}
                  type="button"
                  variant="ghost"
                >
                  移除
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : null}
    </div>
  );
}

function ManagedAccountAvatar({ option }: { option: WorkflowStartOption }) {
  return (
    <Avatar className="size-7 shrink-0">
      <AvatarImage alt="" src={option.avatarUrl} />
      <AvatarFallback className="text-[11px]">
        {option.label.trim().slice(0, 1) || "?"}
      </AvatarFallback>
    </Avatar>
  );
}
