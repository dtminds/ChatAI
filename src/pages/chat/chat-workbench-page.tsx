import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  AiChat02Icon,
  ArrowUp02Icon,
  Chat01Icon,
  CustomerService02Icon,
  Image01Icon,
  Menu11Icon,
  Notification02Icon,
  Search01Icon,
  SmileIcon,
  Task01Icon,
  UserGroup03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ChatMessageList } from "@/pages/chat/components/message-feed";
import { WechatEmojiPicker } from "@/pages/chat/components/wechat-emoji-picker";
import type { Account, Conversation, CustomerProfile } from "@/pages/chat/chat-types";
import { type WechatEmojiName, toWechatEmojiToken } from "@/pages/chat/wechat-emoji";
import { useWorkbenchStore } from "@/store/workbench-store";

const railItems = [
  { label: "工作台", icon: Menu11Icon },
  { label: "聊天", icon: Chat01Icon },
  { label: "客户", icon: UserGroup03Icon },
  { label: "任务", icon: Task01Icon },
];

const DEFAULT_CUSTOMER_PANEL_WIDTH = 304;
const MIN_CUSTOMER_PANEL_WIDTH = 256;
const MAX_CUSTOMER_PANEL_WIDTH = 420;
const MIN_MESSAGE_PANEL_WIDTH = 520;
const INPUT_ENTER_BEHAVIORS = {
  newline: "Enter换行",
  send: "Enter发送",
} as const;

type InputEnterBehavior = keyof typeof INPUT_ENTER_BEHAVIORS;

export function ChatWorkbenchPage() {
  const {
    accounts,
    activeAccountId,
    activeConversationId,
    activeMessageSeq,
    activeMode,
    bootstrapError,
    bootstrapStatus,
    claimActiveConversation,
    claimStatus,
    conversationListsByScope,
    customerProfilesById,
    hasMoreHistoryByConversationId,
    initializeWorkbench,
    historyStatus,
    isConversationLoading,
    loadOlderMessages,
    me,
    messagesByConversationId,
    pollState,
    pollWorkbench,
    retryFailedMessage,
    sendAgentTextMessage,
    sendStatus,
    setActiveAccount,
    setActiveConversation,
    setActiveMode,
  } = useWorkbenchStore();

  const [draft, setDraft] = useState("");
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [inputEnterBehavior, setInputEnterBehavior] =
    useState<InputEnterBehavior>("send");
  const [customerPanelWidth, setCustomerPanelWidth] = useState(
    DEFAULT_CUSTOMER_PANEL_WIDTH,
  );
  const [isResizingCustomerPanel, setIsResizingCustomerPanel] = useState(false);
  const workbenchBodyRef = useRef<HTMLDivElement | null>(null);
  const messageListBottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);

  const activeAccount =
    accounts.find((account) => account.id === activeAccountId) ?? accounts[0];
  const allConversations = conversationListsByScope[activeAccountId] ?? [];
  const visibleConversations = allConversations.filter(
    (conversation) => conversation.mode === activeMode,
  );
  const activeConversation =
    visibleConversations.find(
      (conversation) => conversation.id === activeConversationId,
    ) ?? visibleConversations[0];
  const activeMessages =
    (activeConversation && messagesByConversationId[activeConversation.id]) ?? [];
  const hasMoreHistory = activeConversation
    ? hasMoreHistoryByConversationId[activeConversation.id] !== false
    : false;
  const activeCustomer =
    (activeConversation &&
      customerProfilesById[activeConversation.customerId]) ??
    undefined;
  const isClaimedByCurrentUser =
    !!activeConversation?.assignedEmployeeId &&
    activeConversation.assignedEmployeeId === me?.id;
  const isClaimedByOther =
    !!activeConversation?.assignedEmployeeId &&
    activeConversation.assignedEmployeeId !== me?.id;
  const canSendMessage =
    bootstrapStatus === "ready" &&
    !!activeConversation &&
    !isClaimedByOther &&
    sendStatus !== "sending";
  const composerHint = isClaimedByOther
    ? "该会话已被其他坐席领取，当前只读。"
    : activeConversation?.status === "public" && !isClaimedByCurrentUser
      ? "发送第一条消息时会自动领取会话。"
      : pollState.status === "error"
        ? "轮询暂时失败，消息状态可能延迟回收。"
        : sendStatus === "sending"
          ? "消息已受理，等待轮询回收最终状态。"
          : "Enter 发送，Shift + Enter 换行。";

  const runPollCycle = useEffectEvent(async () => {
    await pollWorkbench();
  });

  useEffect(() => {
    void initializeWorkbench();
  }, [initializeWorkbench]);

  useEffect(() => {
    document.body.style.cursor = isResizingCustomerPanel ? "col-resize" : "";
    document.body.style.userSelect = isResizingCustomerPanel ? "none" : "";

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizingCustomerPanel]);

  useEffect(() => {
    const syncCustomerPanelWidth = () => {
      const availableWidth = workbenchBodyRef.current?.clientWidth;

      if (!availableWidth) {
        return;
      }

      setCustomerPanelWidth((currentWidth) =>
        clampCustomerPanelWidth(currentWidth, availableWidth),
      );
    };

    syncCustomerPanelWidth();
    window.addEventListener("resize", syncCustomerPanelWidth);

    return () => {
      window.removeEventListener("resize", syncCustomerPanelWidth);
    };
  }, []);

  useEffect(() => {
    if (!isEmojiPickerOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (!target || emojiPickerRef.current?.contains(target)) {
        return;
      }

      setIsEmojiPickerOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsEmojiPickerOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isEmojiPickerOpen]);

  useEffect(() => {
    setIsEmojiPickerOpen(false);
  }, [activeConversation?.id]);

  useEffect(() => {
    const animationId = window.requestAnimationFrame(() => {
      messageListBottomRef.current?.scrollIntoView({
        block: "end",
      });
    });

    return () => {
      window.cancelAnimationFrame(animationId);
    };
  }, [activeConversation?.id, activeMessages.length]);

  useEffect(() => {
    if (bootstrapStatus !== "ready" || !activeAccountId) {
      return;
    }

    let timeoutId = 0;
    let cancelled = false;

    const scheduleNextPoll = () => {
      const baseInterval =
        document.visibilityState === "hidden" ? 10000 : pollState.intervalMs;
      const jitter = Math.floor(Math.random() * pollState.jitterMs);

      timeoutId = window.setTimeout(async () => {
        await runPollCycle();

        if (!cancelled) {
          scheduleNextPoll();
        }
      }, baseInterval + jitter);
    };

    scheduleNextPoll();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    activeAccountId,
    activeConversationId,
    bootstrapStatus,
    pollState.intervalMs,
    pollState.jitterMs,
    runPollCycle,
  ]);

  const handleSendDraft = () => {
    const normalizedDraft = draft.trim();

    if (!normalizedDraft || !canSendMessage) {
      return;
    }

    void sendAgentTextMessage(normalizedDraft);
    setDraft("");
    textareaRef.current?.focus();
  };

  const handleDraftKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    const shouldSend =
      inputEnterBehavior === "newline" ? event.shiftKey : !event.shiftKey;

    if (shouldSend) {
      event.preventDefault();
      handleSendDraft();
    }
  };

  const handleEmojiSelect = (name: WechatEmojiName) => {
    const nextToken = toWechatEmojiToken(name);
    const textarea = textareaRef.current;

    setIsEmojiPickerOpen(false);

    if (!textarea) {
      setDraft((currentDraft) => `${currentDraft}${nextToken}`);
      return;
    }

    const selectionStart = textarea.selectionStart ?? draft.length;
    const selectionEnd = textarea.selectionEnd ?? draft.length;
    const nextDraft =
      draft.slice(0, selectionStart) + nextToken + draft.slice(selectionEnd);
    const nextCursorPosition = selectionStart + nextToken.length;

    setDraft(nextDraft);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  };

  const handleCustomerPanelResizeStart = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    setIsResizingCustomerPanel(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const bodyRect = workbenchBodyRef.current?.getBoundingClientRect();

      if (!bodyRect) {
        return;
      }

      setCustomerPanelWidth(
        clampCustomerPanelWidth(bodyRect.right - moveEvent.clientX, bodyRect.width),
      );
    };

    const handlePointerUp = () => {
      setIsResizingCustomerPanel(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  if (bootstrapStatus === "loading" && accounts.length === 0) {
    return (
      <div className="flex h-svh items-center justify-center bg-[#F7F8F9] px-6">
        <div className="rounded-2xl border border-[#E7EBF0] bg-white px-6 py-5 text-sm text-[#66758A] shadow-sm">
          正在加载工作台数据...
        </div>
      </div>
    );
  }

  if (bootstrapStatus === "error" && accounts.length === 0) {
    return (
      <div className="flex h-svh items-center justify-center bg-[#F7F8F9] px-6">
        <div className="max-w-md rounded-2xl border border-[#F2D1D4] bg-white px-6 py-5 shadow-sm">
          <p className="text-sm font-semibold text-foreground">工作台初始化失败</p>
          <p className="mt-2 text-sm leading-6 text-[#6D7787]">
            {bootstrapError ?? "暂时无法获取会话数据。"}
          </p>
          <Button
            className="mt-4 h-9 rounded-lg px-4 text-[13px] shadow-none"
            onClick={() => {
              startTransition(() => {
                void initializeWorkbench();
              });
            }}
          >
            重新加载
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-svh min-h-[720px] bg-[#F7F8F9]">
      <div className="grid h-full grid-cols-[14.5rem_minmax(0,1fr)] overflow-hidden">
        <section className="flex h-full min-h-0 flex-col bg-[#F7F8F9] px-3 py-4">
          <div className="mb-3 flex items-center px-1">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <HugeiconsIcon
                icon={CustomerService02Icon}
                size={18}
                strokeWidth={1.7}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1 px-1">
            {railItems.map((item) => {
              const isActive = item.label === "聊天";

              return (
                <button
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[20px] px-3 py-3 text-[12px] font-medium transition-colors",
                    isActive
                      ? "border border-[#dfe4ea] bg-white text-foreground shadow-[0_2px_8px_rgba(15,23,42,0.05)]"
                      : "border border-transparent text-[#6b7a90] hover:bg-white/70 hover:text-foreground",
                  )}
                  key={item.label}
                  type="button"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={item.icon}
                    size={16}
                    strokeWidth={1.8}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="my-4 h-px bg-[#EEEFF0]" />

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2 py-1">
              {accounts.map((account) => {
                const isActive = account.id === activeAccountId;

                return (
                  <AccountSidebarItem
                    account={account}
                    isActive={isActive}
                    key={account.id}
                    onClick={() => {
                      startTransition(() => {
                        void setActiveAccount(account.id);
                      });
                    }}
                  />
                );
              })}
            </div>
          </ScrollArea>

          <div className="flex items-center gap-1 px-1 pt-3 text-[10px] text-[#7c889a]">
            <HugeiconsIcon
              color="currentColor"
              icon={Notification02Icon}
              size={14}
              strokeWidth={1.8}
            />
            <span>{Math.floor(pollState.intervalMs / 1000)}s</span>
            {pollState.status === "error" ? (
              <span className="text-[#d54b4b]">轮询异常</span>
            ) : null}
          </div>
        </section>

        <div className="h-full min-h-0 pl-0">
          <div
            className={cn(
              "grid h-full min-h-0 overflow-hidden rounded-[20px_0_0_20px] border-l border-[#EBEDEE] bg-white lg:grid-cols-[18rem_minmax(0,1fr)]",
              isResizingCustomerPanel && "select-none",
            )}
            style={{ boxShadow: "-5px 0 10px -4px rgba(20, 37, 44, 0.04)" }}
          >
            <section className="flex min-h-0 min-w-0 flex-col border-r border-[#EEEFF0] bg-white">
              <div className="border-b border-[#EEEFF0] px-4 py-4">
                <div className="relative">
                  <HugeiconsIcon
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    color="currentColor"
                    icon={Search01Icon}
                    size={16}
                    strokeWidth={1.8}
                  />
                  <Input
                    className="h-9 rounded-xl border border-transparent bg-[#f3f4f6] pl-10 text-sm shadow-none transition-colors focus-visible:border-[#d6dbe3] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-ring/12"
                    placeholder="搜索客户、手机号或会话关键词"
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1">
                <Tabs
                  className="flex h-full min-h-0 flex-col"
                  onValueChange={(value) => {
                    startTransition(() => {
                      void setActiveMode(value as "single" | "group");
                    });
                  }}
                  value={activeMode}
                >
                  <div className="border-b border-[#EEEFF0] px-4">
                    <TabsList className="h-auto w-full justify-center gap-5 rounded-none bg-transparent p-0">
                      <TabsTrigger
                        className="rounded-none border-b-2 border-transparent px-0 py-2.5 text-[13px] font-medium text-[#6d7787] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                        value="single"
                      >
                        单聊
                      </TabsTrigger>
                      <TabsTrigger
                        className="rounded-none border-b-2 border-transparent px-0 py-2.5 text-[13px] font-medium text-[#6d7787] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                        value="group"
                      >
                        群聊
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent className="mt-0 min-h-0 flex-1" value={activeMode}>
                    <ScrollArea className="h-full">
                      <div className="bg-white px-2 py-1.5">
                        {visibleConversations.length === 0 ? (
                          <div className="px-2 py-4 text-sm text-muted-foreground">
                            当前账号下暂无{activeMode === "single" ? "单聊" : "群聊"}占位数据。
                          </div>
                        ) : null}
                        {visibleConversations.map((conversation) => (
                          <ConversationCard
                            conversation={conversation}
                            isActive={conversation.id === activeConversation?.id}
                            key={conversation.id}
                            onSelect={() => {
                              startTransition(() => {
                                void setActiveConversation(conversation.id);
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

            <section className="flex min-h-0 min-w-0 flex-col bg-white">
              <div className="flex min-h-[69px] items-center border-b border-[#EEEFF0] px-5 py-3">
                <div className="flex w-full items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[17px] font-semibold text-foreground">
                        {activeConversation?.customerName ?? "请选择会话"}
                      </p>
                      <span className="text-sm font-medium text-[#2eaf63]">
                        @微信
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      消息游标 {activeMessageSeq} · {activeConversation?.quietFor ?? "实时同步"}
                    </p>
                  </div>

                  <div className="hidden items-center gap-2 md:flex">
                    <Button
                      className="h-9 rounded-lg border-[#d8dfea] bg-white px-3 text-[13px] shadow-none"
                      disabled={
                        !activeConversation ||
                        historyStatus === "loading" ||
                        !hasMoreHistory
                      }
                      onClick={() => {
                        startTransition(() => {
                          void loadOlderMessages();
                        });
                      }}
                      variant="outline"
                    >
                      {historyStatus === "loading" ? "加载中..." : "查看历史"}
                    </Button>
                    <Button
                      className="h-9 rounded-lg px-3 text-[13px] shadow-none"
                      disabled={
                        !activeConversation ||
                        isClaimedByCurrentUser ||
                        isClaimedByOther ||
                        claimStatus === "claiming"
                      }
                      onClick={() => {
                        startTransition(() => {
                          void claimActiveConversation();
                        });
                      }}
                    >
                      {isClaimedByCurrentUser
                        ? "已领取"
                        : claimStatus === "claiming"
                          ? "领取中..."
                          : "领取会话"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 min-w-0 flex-1" ref={workbenchBodyRef}>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
                  <ScrollArea className="min-h-0 flex-1 bg-white">
                    <div className="px-5 py-5">
                      {isConversationLoading ? (
                        <div className="mb-4 rounded-xl border border-dashed border-[#DEE5EE] px-4 py-3 text-sm text-[#728093]">
                          正在刷新当前会话...
                        </div>
                      ) : null}
                      <ChatMessageList
                        messages={activeMessages}
                        onRetryMessage={(messageId) => {
                          startTransition(() => {
                            void retryFailedMessage(messageId);
                          });
                        }}
                      />
                      <div aria-hidden="true" ref={messageListBottomRef} />
                    </div>
                  </ScrollArea>

                  <Separator className="bg-[#EEEFF0]" />

                  <div className="space-y-1.5 bg-white px-5 py-3">
                    <div className="ml-[-6px] flex items-center justify-between gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <div className="relative" ref={emojiPickerRef}>
                          <button
                            aria-label="微信表情"
                            className={cn(
                              "inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-[#f3f6fb] hover:text-foreground",
                              isEmojiPickerOpen && "bg-[#eef4ff] text-primary",
                            )}
                            onClick={() => setIsEmojiPickerOpen((current) => !current)}
                            type="button"
                          >
                            <HugeiconsIcon icon={SmileIcon} size={18} strokeWidth={1.8} />
                          </button>

                          {isEmojiPickerOpen ? (
                            <div className="absolute bottom-full left-0 z-30 mb-3">
                              <WechatEmojiPicker onSelect={handleEmojiSelect} />
                            </div>
                          ) : null}
                        </div>
                        <button
                          aria-label="发送图片"
                          className="inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-[#f3f6fb] hover:text-foreground"
                          type="button"
                        >
                          <HugeiconsIcon icon={Image01Icon} size={18} strokeWidth={1.8} />
                        </button>
                        <button
                          aria-label="AI 助手"
                          className="inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-[#f3f6fb] hover:text-foreground"
                          type="button"
                        >
                          <HugeiconsIcon icon={AiChat02Icon} size={18} strokeWidth={1.8} />
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <Select
                          onValueChange={(value) =>
                            setInputEnterBehavior(value as InputEnterBehavior)
                          }
                          value={inputEnterBehavior}
                        >
                          <SelectTrigger
                            aria-label="选择 Enter 键行为"
                            className="h-7 min-w-0 border-0 bg-transparent px-1.5 text-[#8b96a6] focus:ring-0"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent align="end">
                            <SelectItem value="send">
                              {INPUT_ENTER_BEHAVIORS.send}
                            </SelectItem>
                            <SelectItem value="newline">
                              {INPUT_ENTER_BEHAVIORS.newline}
                            </SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          aria-label="发送消息"
                          className="size-7 rounded-full p-0 shadow-none"
                          disabled={!draft.trim() || !canSendMessage}
                          onClick={handleSendDraft}
                          size="icon"
                        >
                          <HugeiconsIcon icon={ArrowUp02Icon} size={14} strokeWidth={2} />
                        </Button>
                      </div>
                    </div>

                    <Textarea
                      className="chat-composer-textarea min-h-28 resize-none rounded-none border-0 bg-transparent py-1 pl-0 pr-0.5 text-[14px] shadow-none focus-visible:ring-0"
                      disabled={!canSendMessage}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={handleDraftKeyDown}
                      placeholder={
                        canSendMessage ? "请输入消息……" : "当前会话暂不可发送消息"
                      }
                      ref={textareaRef}
                      value={draft}
                    />
                    <p className="px-0.5 text-[12px] leading-5 text-[#8A94A6]">
                      {composerHint}
                    </p>
                  </div>
                </div>

                <button
                  aria-label="调整客户信息栏宽度"
                  className={cn(
                    "relative hidden w-3 shrink-0 cursor-col-resize items-stretch justify-center bg-white transition-colors xl:flex",
                    isResizingCustomerPanel ? "bg-[#f5f8fd]" : "hover:bg-[#f7f9fc]",
                  )}
                  onPointerDown={handleCustomerPanelResizeStart}
                  type="button"
                >
                  <span
                    className={cn(
                      "h-full w-px bg-[#EEEFF0] transition-colors",
                      isResizingCustomerPanel && "bg-[#9cbcf8]",
                    )}
                  />
                </button>

                <aside
                  className="hidden min-h-0 min-w-0 flex-col bg-white xl:flex"
                  style={{ width: `${customerPanelWidth}px` }}
                >
                  <Tabs className="h-full min-h-0 gap-0" defaultValue="system">
                    <div className="border-b border-[#EEEFF0] px-4">
                      <TabsList className="h-auto w-full justify-start gap-6 rounded-none bg-transparent p-0">
                        <TabsTrigger
                          className="min-w-0 rounded-none border-b-2 border-transparent px-0 py-3 text-[13px] font-medium text-[#6d7787] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                          value="system"
                        >
                          系统
                        </TabsTrigger>
                        <TabsTrigger
                          className="min-w-0 rounded-none border-b-2 border-transparent px-0 py-3 text-[13px] font-medium text-[#6d7787] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                          value="baidu"
                        >
                          百度
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent className="mt-0 min-h-0 flex-1" value="system">
                      <CustomerSystemPanel
                        accountName={activeAccount?.name}
                        customer={activeCustomer}
                      />
                    </TabsContent>

                    <TabsContent className="mt-0 min-h-0 flex-1 overflow-hidden" value="baidu">
                      <iframe
                        className="h-full w-full border-0 bg-white"
                        src="https://www.baidu.com"
                        title="百度客户扩展页"
                      />
                    </TabsContent>
                  </Tabs>
                </aside>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomerSystemPanel({
  accountName,
  customer,
}: {
  accountName?: string;
  customer?: CustomerProfile;
}) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 px-4 py-4">
        <section className="space-y-2 border-b border-[#EEEFF0] pb-4">
          <p className="text-xs leading-5 text-muted-foreground">
            {customer?.persona ?? "这里用于承载客户画像、标签、任务和备注。"}
          </p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">客户阶段</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                {customer?.stage ?? "--"}
              </p>
            </div>
            <Badge className="rounded-md px-2 py-0.5 text-[10px]">
              意向 {customer?.intentScore ?? 0}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <InfoRow label="城市" value={customer?.city ?? "--"} />
            <InfoRow label="电话" value={customer?.phone ?? "--"} />
            <InfoRow label="当前账号" value={accountName ?? "--"} />
          </div>
        </section>

        <section className="space-y-2 border-b border-[#EEEFF0] pb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground">客户标签</h3>
            <span className="text-xs text-muted-foreground">占位</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {customer?.tags.map((tag) => (
              <Badge className="rounded-md px-2 py-0.5 text-[10px]" key={tag}>
                {tag}
              </Badge>
            ))}
          </div>
        </section>

        <section className="space-y-2 border-b border-[#EEEFF0] pb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground">关键指标</h3>
            <span className="text-xs text-muted-foreground">占位数据</span>
          </div>
          <div className="space-y-1.5">
            {customer?.metrics.map((metric) => (
              <div
                className="flex items-center justify-between border border-border bg-white px-3 py-2"
                key={metric.label}
              >
                <span className="text-xs text-muted-foreground">{metric.label}</span>
                <span className="text-xs font-medium text-foreground">{metric.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2 border-b border-[#EEEFF0] pb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground">跟进任务</h3>
            <span className="text-xs text-muted-foreground">占位</span>
          </div>
          <div className="space-y-1.5">
            {customer?.tasks.map((task) => (
              <div className="border border-border bg-white px-3 py-2.5" key={task.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-foreground">{task.title}</p>
                  <Badge className="rounded-md px-2 py-0.5 text-[10px]" variant="outline">
                    {task.status === "done"
                      ? "已完成"
                      : task.status === "due"
                        ? "临期"
                        : "待处理"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground">沟通备注</h3>
            <span className="text-xs text-muted-foreground">客服视图</span>
          </div>
          <div className="space-y-1.5">
            {customer?.notes.map((note) => (
              <div
                className="border border-dashed border-border bg-white px-3 py-2.5 text-xs leading-5 text-muted-foreground"
                key={note}
              >
                {note}
              </div>
            ))}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}

function AccountSidebarItem({
  account,
  isActive,
  onClick,
}: {
  account: Account;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "relative flex w-full items-start gap-2 rounded-[16px] border px-2.5 py-2 text-left transition-colors",
        isActive
          ? "border-[#e7ebf0] bg-white"
          : "border-transparent bg-transparent hover:bg-white/70",
      )}
      onClick={onClick}
      title={account.name}
      type="button"
    >
      <Avatar className="mt-0.5 size-10">
        <AvatarImage alt={account.name} src={account.avatarUrl} />
        <AvatarFallback>{account.name.slice(0, 1)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[13px] font-semibold text-foreground">
            {account.name}
          </p>
          <div
            className={cn(
              "flex shrink-0 items-center gap-1 text-[10px] leading-none",
              account.loginStatus === "offline" ? "text-[#98A2B3]" : "text-[#28B266]",
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                account.loginStatus === "offline" ? "bg-[#C7CED8]" : "bg-[#28B266]",
              )}
            />
            <span>{account.loginStatus === "offline" ? "离线" : "在线"}</span>
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="truncate text-[12px] text-[#6e7887]">
            {account.operator}
          </p>
          {account.unreadCount ? (
            <span className="rounded-full bg-[#ff4d4f] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
              {account.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function ConversationCard({
  conversation,
  isActive,
  onSelect,
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={cn(
        "mb-1 w-full overflow-hidden border-b px-2.5 py-2.5 text-left transition-colors",
        isActive
          ? "rounded-md border-transparent bg-[#edf4ff] text-foreground"
          : "border-[#EEEFF0] bg-white hover:bg-[#f7f9fc]",
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5">
        <div className="relative">
          <Avatar className="size-10">
            <AvatarImage
              alt={conversation.customerName}
              src={conversation.customerAvatarUrl}
            />
            <AvatarFallback>{conversation.customerName.slice(0, 1)}</AvatarFallback>
          </Avatar>
          {conversation.unread > 0 && !isActive ? (
            <div className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#ff4d4f] px-1 py-0.5 text-center text-[10px] font-semibold leading-none text-white">
              {conversation.unread}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-[14px] font-medium text-foreground">
                {conversation.customerName}
              </p>
              {conversation.mode === "group" ? (
                <span
                  className={cn(
                    "rounded px-1 py-0.5 text-[10px]",
                    isActive
                    ? "bg-[#dce9ff] text-primary"
                    : "bg-[#eef3ff] text-primary",
                  )}
                >
                  群
                </span>
              ) : null}
            </div>
            {conversation.priority === "high" ? (
              <span className="shrink-0 whitespace-nowrap rounded bg-[#FFF1F1] px-1 py-0.5 text-[10px] leading-none text-[#C74848]">
                高优先
              </span>
            ) : (
              <span />
            )}
          </div>

          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <p className="truncate text-[12px] text-[#7b8798]">
              {conversation.preview}
            </p>
            <span className="shrink-0 whitespace-nowrap text-xs text-[#8a94a6]">
              {formatConversationTimestamp(conversation.updatedAt)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function formatConversationTimestamp(value: string) {
  const date = parseWorkbenchDate(value);

  if (!date) {
    return value;
  }

  const now = new Date();

  if (isSameCalendarDay(date, now)) {
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diffMinutes >= 0 && diffMinutes < 60) {
      return `${Math.max(diffMinutes, 1)}分钟前`;
    }

    return formatDatePart(date, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  if (date.getFullYear() === now.getFullYear()) {
    return [
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("/");
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("/");
}

function clampCustomerPanelWidth(width: number, availableWidth: number) {
  const maxWidth = Math.min(
    MAX_CUSTOMER_PANEL_WIDTH,
    Math.max(MIN_CUSTOMER_PANEL_WIDTH, availableWidth - MIN_MESSAGE_PANEL_WIDTH),
  );

  return Math.min(Math.max(width, MIN_CUSTOMER_PANEL_WIDTH), maxWidth);
}

function parseWorkbenchDate(value: string) {
  const normalized = value.trim().replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDatePart(
  date: Date,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
