import { WORKFLOW_MESSAGE_MAX_KEYWORDS, WORKFLOW_MESSAGE_MAX_KEYWORD_LENGTH } from "@chatai/contracts";
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function MessageKeywords({ onChange, values }: {
  onChange(values: string[]): void;
  values: string[];
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const errorId = useId();
  const addKeywords = () => {
    const keywords = text.split(/[,，、\r\n]+/).map(value => value.trim()).filter(Boolean);
    if (keywords.length === 0) return;
    const next = [...new Set([...values, ...keywords])];
    if (next.length > WORKFLOW_MESSAGE_MAX_KEYWORDS) {
      setError(`最多添加 ${WORKFLOW_MESSAGE_MAX_KEYWORDS} 个关键词`);
      return;
    }
    if (keywords.some(keyword => keyword.length > WORKFLOW_MESSAGE_MAX_KEYWORD_LENGTH)) {
      setError(`每个关键词最多 ${WORKFLOW_MESSAGE_MAX_KEYWORD_LENGTH} 个字符`);
      return;
    }
    onChange(next);
    setText("");
    setError("");
    setOpen(false);
  };

  return (
    <div className="min-w-0 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          消息关键词
          <span className="text-xs font-normal text-muted-foreground">{values.length} / {WORKFLOW_MESSAGE_MAX_KEYWORDS}</span>
        </p>
        <Popover onOpenChange={nextOpen => {
          if (nextOpen) setError("");
          setOpen(nextOpen);
        }} open={open}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button aria-label="添加消息关键词" className="size-7 shrink-0" disabled={values.length >= WORKFLOW_MESSAGE_MAX_KEYWORDS} size="icon" type="button" variant="ghost">
                    <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>添加消息关键词</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] space-y-2.5">
            <Textarea
              aria-describedby={error ? errorId : undefined}
              aria-invalid={Boolean(error)}
              aria-label="消息关键词"
              className="min-h-20 resize-none text-[13px]"
              onChange={event => {
                setText(event.target.value);
                setError("");
              }}
              onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                  event.preventDefault();
                  addKeywords();
                }
              }}
              placeholder="输入关键词"
              rows={3}
              value={text}
            />
            {error ? <p className="text-xs text-destructive" id={errorId} role="alert">{error}</p> : null}
            <div className="flex justify-end">
              <Button disabled={!text.trim()} onClick={addKeywords} size="sm" type="button">添加</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {values.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">请添加消息关键词</p>
      ) : (
        <ul aria-label="消息关键词" className="flex flex-wrap gap-2">
          {values.map(keyword => (
            <li className="min-w-0 max-w-full" key={keyword}>
              <Badge className="max-w-full gap-1 rounded-lg py-1 pr-1 text-[12px]" variant="secondary">
                <span className="min-w-0 whitespace-pre-wrap break-all">{keyword}</span>
                <Button
                  aria-label={`移除关键词 ${keyword}`}
                  className="size-5 shrink-0 text-muted-foreground"
                  onClick={() => onChange(values.filter(value => value !== keyword))}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={1.8} />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
