import { startTransition } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConversationCard } from "@/pages/chat/components/conversation-card";
import type { ChatMode, Conversation } from "@/pages/chat/chat-types";

type ConversationListPanelProps = {
  activeConversation?: Conversation;
  activeMode: ChatMode;
  conversations: Conversation[];
  onSelectConversation: (conversationId: string) => void | Promise<void>;
  onSelectMode: (mode: ChatMode) => void | Promise<void>;
};

export function ConversationListPanel({
  activeConversation,
  activeMode,
  conversations,
  onSelectConversation,
  onSelectMode,
}: ConversationListPanelProps) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col border-r border-divider bg-surface">
      <div className="border-b border-divider px-4 py-4">
        <div className="relative">
          <HugeiconsIcon
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            color="currentColor"
            icon={Search01Icon}
            size={16}
            strokeWidth={1.8}
          />
          <Input
            className="h-9 rounded-xl border border-transparent bg-surface-muted pl-10 text-sm shadow-none transition-colors focus-visible:border-input focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/12"
            placeholder="搜索客户、手机号或会话关键词"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Tabs
          className="flex h-full min-h-0 flex-col"
          onValueChange={(value) => {
            startTransition(() => {
              void onSelectMode(value as ChatMode);
            });
          }}
          value={activeMode}
        >
          <div className="border-b border-divider px-4">
            <TabsList className="h-auto w-full justify-center gap-5 rounded-none bg-transparent p-0">
              <TabsTrigger
                className="rounded-none border-b-2 border-transparent px-0 py-2.5 text-[13px] font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                value="single"
              >
                单聊
              </TabsTrigger>
              <TabsTrigger
                className="rounded-none border-b-2 border-transparent px-0 py-2.5 text-[13px] font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                value="group"
              >
                群聊
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent className="mt-0 min-h-0 flex-1" value={activeMode}>
            <ScrollArea className="h-full">
              <div className="bg-surface px-2 py-1.5">
                {conversations.length === 0 ? (
                  <div className="px-2 py-4 text-sm text-muted-foreground">
                    当前账号下暂无{activeMode === "single" ? "单聊" : "群聊"}占位数据。
                  </div>
                ) : null}
                {conversations.map((conversation) => (
                  <ConversationCard
                    conversation={conversation}
                    isActive={conversation.id === activeConversation?.id}
                    key={conversation.id}
                    onSelect={() => {
                      startTransition(() => {
                        void onSelectConversation(conversation.id);
                      });
                    }}
                  />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
