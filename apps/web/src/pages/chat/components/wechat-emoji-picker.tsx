import { useState } from "react";
import {
  FavouriteIcon,
  SmileIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { WorkbenchMaterialCollectionItemDto } from "@chatai/contracts";
import {
  WECHAT_EMOJIS,
  type WechatEmojiName,
} from "@/pages/chat/wechat-emoji";
import { MaterialExpressionSection } from "@/pages/chat/components/material-collection";

type WechatEmojiPickerProps = {
  collectedExpressions?: WorkbenchMaterialCollectionItemDto[];
  hasMoreCollectedExpressions?: boolean;
  isCollectedExpressionLoadingMore?: boolean;
  sendingCollectedExpressionId?: string | null;
  onDeleteCollectedExpression?: (item: WorkbenchMaterialCollectionItemDto) => void;
  onLoadMoreCollectedExpressions?: () => void;
  onOpenCollectedExpressions?: () => void;
  onSelect: (name: WechatEmojiName) => void;
  onSelectCollectedExpression?: (item: WorkbenchMaterialCollectionItemDto) => void;
  onTopCollectedExpression?: (item: WorkbenchMaterialCollectionItemDto) => void;
};

export function WechatEmojiPicker({
  collectedExpressions = [],
  hasMoreCollectedExpressions = false,
  isCollectedExpressionLoadingMore = false,
  sendingCollectedExpressionId,
  onDeleteCollectedExpression,
  onLoadMoreCollectedExpressions,
  onOpenCollectedExpressions,
  onSelect,
  onSelectCollectedExpression,
  onTopCollectedExpression,
}: WechatEmojiPickerProps) {
  const [activeTab, setActiveTab] = useState("wechat");

  return (
    <div className="w-[min(42rem,calc(100vw-3.5rem))] overflow-hidden rounded-[20px] border border-border bg-popover shadow-[0_28px_80px_-36px_var(--shadow-strong)]">
      <Tabs
        className="gap-0"
        onValueChange={(value) => {
          setActiveTab(value);

          if (value === "custom") {
            onOpenCollectedExpressions?.();
          }
        }}
        value={activeTab}
      >
        <TabsContent className="mt-0" value="wechat">
          <ScrollArea className="h-[23rem] bg-popover">
            <div className="grid grid-cols-7 gap-1.5 p-4 sm:grid-cols-9 md:grid-cols-11 lg:grid-cols-13">
              {WECHAT_EMOJIS.map((emoji) => (
                <button
                  aria-label={emoji.name}
                  className="group flex aspect-square items-center justify-center rounded-[14px] transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  key={emoji.name}
                  onClick={() => onSelect(emoji.name)}
                  title={emoji.name}
                  type="button"
                >
                  <img
                    alt={emoji.name}
                    className="size-7 object-contain transition-transform group-hover:scale-105"
                    draggable={false}
                    loading="lazy"
                    src={emoji.path}
                  />
                </button>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent className="mt-0" value="custom">
          <ScrollArea className="h-[23rem] bg-popover">
            <MaterialExpressionSection
              hasMore={hasMoreCollectedExpressions}
              isLoadingMore={isCollectedExpressionLoadingMore}
              items={collectedExpressions}
              onDelete={onDeleteCollectedExpression}
              onLoadMore={onLoadMoreCollectedExpressions}
              onSelect={(item) => onSelectCollectedExpression?.(item)}
              sendingItemId={sendingCollectedExpressionId}
              onTop={onTopCollectedExpression}
            />
          </ScrollArea>
        </TabsContent>

        <div className="border-t border-divider bg-surface-muted/70 px-3 py-2">
          <TabsList className="h-9 gap-1 rounded-[10px] bg-transparent p-0">
            <TabsTrigger
              aria-label="微信表情"
              className="size-9 min-w-0 rounded-[8px] p-0 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
              value="wechat"
            >
              <HugeiconsIcon icon={SmileIcon} size={18} strokeWidth={1.8} />
            </TabsTrigger>
            <TabsTrigger
              aria-label="自定义表情"
              className="size-9 min-w-0 rounded-[8px] p-0 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
              value="custom"
            >
              <HugeiconsIcon icon={FavouriteIcon} size={18} strokeWidth={1.8} />
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
    </div>
  );
}
