import { useState, type ReactNode } from "react";
import type {
  InsightDetailResponse,
  InsightMessageContextResponse,
} from "@chatai/contracts";
import {
  AiIdeaIcon,
  ArrowDown01Icon,
  CheckmarkSquare02Icon,
  CrazyIcon,
  Database01Icon,
  FlushedIcon,
  InformationCircleIcon,
  LibraryIcon,
  LookTopIcon,
  Sad02Icon,
  ServiceIcon,
  SmileIcon,
  Tag01Icon,
  Timer01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@/components/ui/empty";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { adaptMessage } from "@/pages/chat/api/workbench-adapter";
import { HistoryCompactMessageList } from "@/pages/chat/components/message-history-side-panel";
import type { Account, CustomerProfile } from "@/pages/chat/chat-types";
import { AnalysisPhaseBadge, AnalysisStatusBadge, ResolutionBadge } from "./insight-badges";
import { InsightPerson } from "./insight-person";
import { formatInsightTime } from "./insights-utils";

type DetailActionStatus = Extract<
  InsightDetailResponse["actionItems"][number]["status"],
  "done" | "dismissed" | "open"
>;

export function InsightDetailPanel({
  detail,
  error,
  isOpen,
  isLoading,
  isMessagesLoading,
  messages,
  messagesError,
  onActionStatusChange,
  onOpenChange,
}: {
  detail?: InsightDetailResponse;
  error?: Error;
  isOpen: boolean;
  isLoading?: boolean;
  isMessagesLoading?: boolean;
  messages?: InsightMessageContextResponse["messages"];
  messagesError?: Error;
  onActionStatusChange?: (actionItemId: string, status: DetailActionStatus) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const evidenceRecordMessages = messages
    ? adaptInsightMessages(messages)
    : [];
  const evidenceByMessageId = detail ? buildEvidenceByMessageId(detail.evidenceItems) : new Map<string, EvidenceViewItem[]>();

  return (
    <Sheet onOpenChange={onOpenChange} open={isOpen}>
      <SheetContent className="w-full overflow-hidden sm:max-w-[min(1180px,calc(100vw-48px))]">
          <SheetTitle className="sr-only">洞察详情</SheetTitle>
          <SheetDescription className="sr-only">
            查看本轮咨询会话的分析结果和对话证据
          </SheetDescription>

          {detail ? (
            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_420px]">
                <div className="min-h-0 overflow-y-auto px-6 py-6">
                  <section
                    aria-label="洞察结论"
                    className="max-w-[760px] space-y-7"
                    role="region"
                  >
                    <DetailSummarySection
                      detail={detail}
                      onActionStatusChange={onActionStatusChange}
                    />

                    <div className="space-y-6">
                      <QualityFindingsSection items={detail.qaFindings} />
                      <section className="space-y-4 border-t pt-5">
                        <SectionHeading icon={AiIdeaIcon}>智能归因</SectionHeading>
                        <InsightResultTable
                          items={buildBusinessAttributionItems(detail)}
                        />
                      </section>
                      <InsightFaqList
                        items={detail.faqCandidates}
                      />
                    </div>
                  </section>
                </div>

                <aside
                  aria-label="本轮对话"
                  className="min-h-0 border-l bg-muted/20"
                  role="region"
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="border-b bg-background px-5 py-4">
                      <h3 className="inline-flex items-baseline gap-2 text-sm font-semibold text-foreground">
                        <span>本轮对话</span>
                        {!isMessagesLoading ? (
                          <span className="text-xs font-normal text-muted-foreground">
                            {evidenceRecordMessages.length} 条
                          </span>
                        ) : null}
                      </h3>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                      {isMessagesLoading ? (
                        <InsightLoadingState text="正在加载本轮对话" />
                      ) : messagesError ? (
                        <div className="rounded-[8px] border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
                          本轮对话加载失败
                        </div>
                      ) : evidenceRecordMessages.length > 0 ? (
                        <HistoryCompactMessageList
                          messages={evidenceRecordMessages}
                          renderMetaSuffix={(message) => {
                            const evidence = evidenceByMessageId.get(String(message.seq ?? ""));

                            return evidence?.length ? <EvidenceBadge evidence={evidence} /> : null;
                          }}
                          textWeight="normal"
                        />
                      ) : (
                        <div className="rounded-[8px] border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
                          暂无本轮对话消息
                        </div>
                      )}
                    </div>
                  </div>
                </aside>
            </div>
          ) : (
            isLoading ? (
              <InsightLoadingState text="正在加载会话" />
            ) : (
              <div className="px-6 py-8 text-sm text-muted-foreground">
                {error ? "洞察详情加载失败" : "暂无洞察详情"}
              </div>
            )
          )}
      </SheetContent>
    </Sheet>
  );
}

function InsightLoadingState({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Spinner variant="classic" size={18} />
      <span>{text}</span>
    </div>
  );
}

export function adaptInsightMessages(messages: InsightMessageContextResponse["messages"]) {
  const customerProfiles = buildInsightCustomerProfiles(messages);
  const accounts = buildInsightAccounts(messages);

  return messages.map((message) =>
    adaptMessage(
      message,
      customerProfiles,
      accounts,
    ),
  );
}

function buildInsightCustomerProfiles(
  messages: InsightMessageContextResponse["messages"],
): Record<string, CustomerProfile> {
  return Object.fromEntries(
    messages.map((message) => [
      message.customerId,
      {
        avatarUrl: message.senderType === "customer" ? (message.senderAvatar ?? "") : "",
        city: "",
        id: message.customerId,
        intentScore: 0,
        metrics: [],
        name: message.senderType === "customer" ? (message.senderName ?? "微信客户") : "微信客户",
        notes: [],
        persona: "",
        phone: "",
        stage: "",
        tags: [],
        tasks: [],
      },
    ]),
  );
}

function buildInsightAccounts(
  messages: InsightMessageContextResponse["messages"],
): Record<string, Account> {
  return Object.fromEntries(
    messages.map((message) => [
      message.seatId,
      {
        avatarUrl: message.senderType === "agent" ? (message.senderAvatar ?? "") : "",
        description: "",
        id: message.seatId,
        lastMessageTime: message.createdAt,
        loginStatus: "offline",
        metrics: {
          activeCustomers: 0,
          agents: 0,
          stores: 0,
          totalCustomers: 0,
        },
        name: message.senderType === "agent" ? (message.senderName ?? "客服") : "客服",
        operator: "",
        phone: "",
        tone: "blue",
        unreadCount: 0,
      },
    ]),
  );
}

function DetailSummarySection({
  detail,
  onActionStatusChange,
}: {
  detail: InsightDetailResponse;
  onActionStatusChange?: (actionItemId: string, status: DetailActionStatus) => Promise<void>;
}) {
  const summaryTitle = detail.summary.sessionTitle || "未命名会话";
  const isAnalyzing = detail.analysisStatus === "analyzing";
  const sessionTime = detail.session.endedAt
    ? `${formatInsightTime(detail.session.startedAt)} 至 ${formatInsightTime(detail.session.endedAt)}`
    : `${formatInsightTime(detail.session.startedAt)} 至 进行中`;

  return (
    <section className="space-y-7">
      <div className="space-y-1">
        {detail.session.generatedAt ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground/70">
              <HugeiconsIcon
                aria-hidden
                color="currentColor"
                icon={Timer01Icon}
                size={14}
                strokeWidth={1.8}
              />
              <span>生成于 {formatInsightTime(detail.session.generatedAt)}</span>
            </div>
            {detail.session.endedAt ? <AnalysisPhaseBadge phase={detail.session.phase} /> : null}
          </div>
        ) : isAnalyzing ? (
          <AnalysisStatusBadge />
        ) : null}
        <div className="space-y-1">
          <h2 className="text-[20px] font-semibold leading-8 text-foreground">
            {summaryTitle}
          </h2>
          {detail.summary.text ? (
            <p className="text-sm leading-6 text-foreground">
              {detail.summary.text}
            </p>
          ) : null}
        </div>
      </div>

      <dl className="space-y-3">
        {detail.problemResolution.problemSummary ? (
          <DetailMetaRow label="客户问题">
            <span className="text-sm font-medium text-foreground">
              {detail.problemResolution.problemSummary}
            </span>
          </DetailMetaRow>
        ) : null}
        <DetailMetaRow label="AI 诊断">
          <span className="inline-flex items-center gap-1.5">
            {isAnalyzing ? (
              <AnalysisStatusBadge />
            ) : (
              <>
                <ResolutionBadge status={detail.problemResolution.resolutionStatus} />
                <DiagnosisReasonInfo reason={detail.problemResolution.unresolvedReason} />
              </>
            )}
          </span>
        </DetailMetaRow>
        <DetailMetaRow label="客户">
          <InsightPerson
            avatarUrl={detail.session.customerAvatarUrl}
            name={detail.session.customerName}
            size="sm"
          />
        </DetailMetaRow>
        <DetailMetaRow label="接待客服">
          <InsightPerson
            avatarUrl={detail.session.agentAvatarUrl}
            name={detail.session.agentName ?? "未分配客服"}
            size="sm"
          />
        </DetailMetaRow>
        <DetailMetaRow label="会话时间">
          <span className="text-sm font-medium text-foreground">
            {sessionTime}
          </span>
        </DetailMetaRow>
        <ActionItemsSection
          items={detail.actionItems}
          onActionStatusChange={onActionStatusChange}
        />
      </dl>

    </section>
  );
}

function DiagnosisReasonInfo({ reason }: { reason?: string }) {
  if (!reason) {
    return null;
  }

  return (
    <HoverCard closeDelay={80} openDelay={120}>
      <HoverCardTrigger asChild>
        <button
          aria-label="查看 AI 诊断理由"
          className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
          type="button"
        >
          <HugeiconsIcon
            aria-hidden
            color="currentColor"
            icon={InformationCircleIcon}
            size={14}
            strokeWidth={1.9}
          />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-80 rounded-[8px] p-3 text-sm leading-6 shadow-sm"
        side="top"
        sideOffset={8}
      >
        {reason}
      </HoverCardContent>
    </HoverCard>
  );
}

function DetailMetaRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
      <dt className="text-sm leading-7 text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 leading-7">
        {children}
      </dd>
    </div>
  );
}

function SectionHeading({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: IconSvgElement;
}) {
  return (
    <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
      {icon ? (
        <HugeiconsIcon
          aria-hidden
          className="shrink-0 text-muted-foreground"
          color="currentColor"
          icon={icon}
          size={16}
          strokeWidth={1.9}
        />
      ) : null}
      {children}
    </h3>
  );
}

type EvidenceViewItem = InsightDetailResponse["evidenceItems"][number];

function EvidenceBadge({ evidence }: { evidence: EvidenceViewItem[] }) {
  const primary = pickPrimaryEvidence(evidence);

  if (!primary) {
    return null;
  }

  return (
    <span
      className="inline-flex max-w-[220px] items-center gap-1 rounded-[6px] bg-primary/10 px-1.5 text-[11px] font-medium leading-5 text-primary"
      title={buildEvidenceTitle(evidence)}
    >
      {evidenceRoleText(primary.evidenceRole)}
    </span>
  );
}

function buildEvidenceByMessageId(items: InsightDetailResponse["evidenceItems"]) {
  const map = new Map<string, EvidenceViewItem[]>();

  for (const item of items) {
    if (item.dimensionType !== "problem_resolution") {
      continue;
    }

    const current = map.get(item.messageId) ?? [];
    current.push(item);
    map.set(item.messageId, current);
  }

  return map;
}

function pickPrimaryEvidence(evidence: EvidenceViewItem[]) {
  const priority = [
    "customer_problem",
    "unresolved_signal",
    "agent_solution",
    "closure_signal",
    "primary",
  ];

  return [...evidence].sort((left, right) =>
    evidenceRolePriority(left.evidenceRole, priority) - evidenceRolePriority(right.evidenceRole, priority),
  )[0];
}

function evidenceRolePriority(role: string, priority: string[]) {
  const index = priority.indexOf(role);

  return index === -1 ? priority.length : index;
}

function buildEvidenceTitle(evidence: EvidenceViewItem[]) {
  return evidence
    .map((item) =>
      item.reason
        ? `${evidenceRoleText(item.evidenceRole)}：${item.reason}`
        : evidenceRoleText(item.evidenceRole),
    )
    .join("\n");
}

function evidenceRoleText(role: string) {
  const text: Record<string, string> = {
    agent_solution: "解决方案",
    closure_signal: "闭环证据",
    customer_problem: "客户问题",
    primary: "证据",
    unresolved_signal: "未解决信号",
  };

  return text[role] ?? "证据";
}

type InsightResultItem = {
  display?: "badge" | "text";
  icon: IconSvgElement;
  items: string[];
  label: string;
  sentimentItems?: Array<{
    polarity: string;
    reason: string;
  }>;
};

function InsightResultTable({
  items,
}: {
  items: InsightResultItem[];
}) {
  const visibleItems = items.filter((item) => item.items.length > 0);

  if (visibleItems.length === 0) {
    return <DetailSectionEmptyState />;
  }

  return (
    <dl className="divide-y rounded-[8px] border bg-background">
      {visibleItems.map((item) => (
        <div
          className="grid items-start gap-2 px-3 py-3 sm:grid-cols-[5.5rem_minmax(0,1fr)]"
          key={item.label}
        >
          <dt className="flex min-h-7 items-center text-xs text-muted-foreground">
            <SectionLabel icon={item.icon}>{item.label}</SectionLabel>
          </dt>
          <dd className="flex min-h-7 min-w-0 flex-wrap items-center gap-2">
            {item.display === "text"
              ? item.sentimentItems?.map((value) => (
                  <SentimentResultItem
                    item={value}
                    key={`${item.label}:${value.polarity}:${value.reason}`}
                  />
                ))
              : item.items.map((value) => (
                  <Badge
                    className="max-w-full whitespace-normal rounded-[8px] px-2.5 py-1 text-[13px] font-normal leading-5"
                    key={`${item.label}:${value}`}
                    variant="secondary"
                  >
                    {value}
                  </Badge>
                ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DetailSectionEmptyState() {
  return (
    <Empty className="min-h-[104px] rounded-[8px] border bg-background p-6">
      <EmptyHeader>
        <EmptyDescription>暂无数据</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function SentimentResultItem({
  item,
}: {
  item: {
    polarity: string;
    reason: string;
  };
}) {
  const config = getPolarityConfig(item.polarity);

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Badge
        className={cn(
          "h-7 shrink-0 justify-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-normal",
          config.className,
        )}
      >
        <HugeiconsIcon
          aria-hidden
          color="currentColor"
          icon={config.icon}
          size={16}
          strokeWidth={1.9}
        />
        {config.label}
      </Badge>
      <HoverCard closeDelay={80} openDelay={120}>
        <HoverCardTrigger asChild>
          <button
            aria-label={`查看情绪判定理由：${config.label}`}
            className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
            type="button"
          >
            <HugeiconsIcon
              aria-hidden
              color="currentColor"
              icon={InformationCircleIcon}
              size={14}
              strokeWidth={1.9}
            />
          </button>
        </HoverCardTrigger>
        <HoverCardContent
          align="start"
          className="w-80 rounded-[8px] p-3 text-sm leading-6 shadow-sm"
          side="top"
          sideOffset={8}
        >
          {item.reason}
        </HoverCardContent>
      </HoverCard>
    </span>
  );
}

function QualityFindingsSection({
  items,
}: {
  items: InsightDetailResponse["qaFindings"];
}) {
  const failedItems = items.filter((item) => !item.passed);
  const passedRate = Math.round(((items.length - failedItems.length) / items.length) * 100);

  return (
    <section className="space-y-3 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading icon={ServiceIcon}>服务质检</SectionHeading>
        {items.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <QualityScoreRing value={passedRate} />
            {failedItems.length > 0 ? `${failedItems.length} 项未通过` : "全部通过"}
          </span>
        ) : null}
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <QualityFindingItem item={item} key={`${item.ruleCode}:${item.reason}`} />
          ))}
        </div>
      ) : (
        <DetailSectionEmptyState />
      )}
    </section>
  );
}

function QualityFindingItem({
  item,
}: {
  item: InsightDetailResponse["qaFindings"][number];
}) {
  const [isReasonOpen, setIsReasonOpen] = useState(false);

  return (
    <div
      className={cn(
        "rounded-[12px] border bg-clip-padding bg-origin-border px-3 py-2.5",
        item.passed
          ? "border-success/15 bg-linear-to-r from-transparent from-55% to-success-muted/70"
          : "border-destructive/15 bg-linear-to-r from-transparent from-55% to-destructive-muted/70",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {item.ruleName || item.ruleCode}
          </span>
          {!item.passed && item.reason ? (
            <HoverCard
              closeDelay={80}
              onOpenChange={setIsReasonOpen}
              open={isReasonOpen}
              openDelay={120}
            >
              <HoverCardTrigger asChild>
                <button
                  aria-label={`查看未通过原因：${item.reason}`}
                  className="mt-1 block w-full truncate text-left text-xs leading-5 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                  onBlur={() => setIsReasonOpen(false)}
                  onFocus={() => setIsReasonOpen(true)}
                  onMouseEnter={() => setIsReasonOpen(true)}
                  onMouseLeave={() => setIsReasonOpen(false)}
                  type="button"
                >
                  {item.reason}
                </button>
              </HoverCardTrigger>
              <HoverCardContent
                align="start"
                className="w-80 rounded-[8px] p-3 text-sm leading-6 shadow-sm"
                onMouseEnter={() => setIsReasonOpen(true)}
                onMouseLeave={() => setIsReasonOpen(false)}
                side="top"
              >
                {item.reason}
              </HoverCardContent>
            </HoverCard>
          ) : null}
        </div>
        <Badge
          className={cn(
            "w-14 shrink-0 justify-center px-0",
            item.passed
              ? "bg-success/85 text-success-foreground"
              : "bg-destructive/85 text-destructive-foreground",
          )}
        >
          {item.passed ? "通过" : "未通过"}
        </Badge>
      </div>
    </div>
  );
}

function QualityScoreRing({ value }: { value: number }) {
  const normalizedValue = Math.min(100, Math.max(0, value));

  return (
    <span
      aria-label={`服务质检通过率 ${normalizedValue}%`}
      className="relative inline-flex size-4 items-center justify-center rounded-full"
      role="img"
      style={{
        background: `conic-gradient(var(--color-success) ${normalizedValue * 3.6}deg, var(--color-muted) 0deg)`,
      }}
    >
      <span className="absolute inset-[3px] rounded-full bg-background" />
    </span>
  );
}

function ActionItemsSection({
  items,
  onActionStatusChange,
}: {
  items: InsightDetailResponse["actionItems"];
  onActionStatusChange?: (actionItemId: string, status: DetailActionStatus) => Promise<void>;
}) {
  const [pendingActionId, setPendingActionId] = useState<string>();

  if (items.length === 0) {
    return null;
  }

  async function handleActionStatusChange(actionItemId: string, status: DetailActionStatus) {
    if (!onActionStatusChange) {
      return;
    }

    setPendingActionId(actionItemId);
    try {
      await onActionStatusChange(actionItemId, status);
    } finally {
      setPendingActionId((current) => (current === actionItemId ? undefined : current));
    }
  }

  return (
    <DetailMetaRow label="待办任务">
      <>
        <ul className="space-y-2">
          {items.map((item) => {
            const isPending = pendingActionId === item.actionItemId;
            const canReopen = item.status === "done" || item.status === "dismissed";

            return (
              <li
                className={cn(
                  "flex items-start gap-2.5 rounded-[8px] border border-transparent px-3 py-2",
                  getActionItemSurfaceClassName(item.status),
                  item.status === "dismissed" || item.status === "expired" ? "opacity-65" : null,
                )}
                key={item.actionItemId}
              >
                {item.status === "open" && onActionStatusChange ? (
                  <Button
                    aria-label={`标记完成：${item.title}`}
                    className="mt-[3px] size-4 shrink-0 rounded-[4px] border border-muted-foreground/70 bg-background p-0 hover:border-foreground hover:bg-background"
                    disabled={isPending}
                    onClick={() => void handleActionStatusChange(item.actionItemId, "done")}
                    size="icon"
                    type="button"
                    variant="ghost"
                  />
                ) : (
                  <TodoStatusIcon status={item.status} />
                )}
                <p
                  className={cn(
                    "min-w-0 flex-1 text-sm font-medium leading-6 text-foreground",
                    item.status === "done" ? "text-success/85 line-through decoration-success/55" : null,
                    item.status === "dismissed" || item.status === "expired" ? "text-muted-foreground" : null,
                  )}
                >
                  {item.title}
                </p>
                {(item.status === "open" || canReopen) && onActionStatusChange ? (
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    {item.status === "open" ? (
                      <Button
                        aria-label={`忽略：${item.title}`}
                        className="h-6 rounded-[6px] px-2 text-xs text-muted-foreground"
                        disabled={isPending}
                        onClick={() => void handleActionStatusChange(item.actionItemId, "dismissed")}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        忽略
                      </Button>
                    ) : (
                      <Button
                        aria-label={`重新打开：${item.title}`}
                        className="h-6 rounded-[6px] px-2 text-xs text-muted-foreground"
                        disabled={isPending}
                        onClick={() => void handleActionStatusChange(item.actionItemId, "open")}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        重新打开
                      </Button>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </>
    </DetailMetaRow>
  );
}

function getActionItemSurfaceClassName(
  status: InsightDetailResponse["actionItems"][number]["status"],
) {
  if (status === "done") {
    return "[background:linear-gradient(to_right,var(--color-success-muted)_0%,var(--color-background)_45%)_padding-box,linear-gradient(to_right,color-mix(in_oklch,var(--color-success)_42%,transparent)_0%,color-mix(in_oklch,var(--color-success)_12%,transparent)_48%,color-mix(in_oklch,var(--color-success)_12%,transparent)_100%)_border-box]";
  }

  if (status === "dismissed" || status === "expired") {
    return "[background:linear-gradient(to_right,var(--color-muted)_0%,var(--color-background)_45%)_padding-box,linear-gradient(to_right,color-mix(in_oklch,var(--color-muted-foreground)_34%,transparent)_0%,color-mix(in_oklch,var(--color-muted-foreground)_11%,transparent)_48%,color-mix(in_oklch,var(--color-muted-foreground)_11%,transparent)_100%)_border-box]";
  }

  return "[background:linear-gradient(to_right,var(--color-warning-muted)_0%,var(--color-background)_45%)_padding-box,linear-gradient(to_right,color-mix(in_oklch,var(--color-warning)_44%,transparent)_0%,color-mix(in_oklch,var(--color-warning)_13%,transparent)_48%,color-mix(in_oklch,var(--color-warning)_13%,transparent)_100%)_border-box]";
}

function TodoStatusIcon({
  status,
}: {
  status: InsightDetailResponse["actionItems"][number]["status"];
}) {
  if (status === "done") {
    return (
      <HugeiconsIcon
        aria-hidden
        className="mt-0.5 shrink-0 text-success"
        icon={CheckmarkSquare02Icon}
        size={18}
        strokeWidth={1.8}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "mt-[3px] h-4 w-4 shrink-0 rounded-[4px] border",
        status === "open" ? "border-muted-foreground/70 bg-background" : "border-muted-foreground/40 bg-muted",
      )}
    />
  );
}

function InsightFaqList({
  items,
}: {
  items: InsightDetailResponse["faqCandidates"];
}) {
  return (
    <section className="space-y-3 border-t pt-5">
      <SectionHeading icon={LibraryIcon}>知识沉淀</SectionHeading>
      {items.length > 0 ? (
        <ol className="space-y-2">
          {items.map((item, index) => (
            <Collapsible asChild defaultOpen={false} key={`${item.question}:${item.status}`}>
              <li className="rounded-[8px] bg-muted/45 px-3 py-2 text-sm leading-6 text-foreground">
                <CollapsibleTrigger className="group grid w-full gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/35 sm:grid-cols-[2rem_minmax(0,1fr)_1.25rem]">
                  <span className="text-xs leading-6 text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0 font-medium">
                    {item.question}
                  </span>
                  <HugeiconsIcon
                    aria-hidden
                    className="mt-1 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                    color="currentColor"
                    icon={ArrowDown01Icon}
                    size={16}
                    strokeWidth={1.8}
                  />
                </CollapsibleTrigger>
                {item.answerHint ? (
                  <CollapsibleContent className="mt-1 grid gap-2 text-muted-foreground sm:grid-cols-[2rem_minmax(0,1fr)_1.25rem]">
                    <span aria-hidden />
                    <span>{item.answerHint}</span>
                    <span aria-hidden />
                  </CollapsibleContent>
                ) : null}
              </li>
            </Collapsible>
          ))}
        </ol>
      ) : (
        <DetailSectionEmptyState />
      )}
    </section>
  );
}

function SectionLabel({
  children,
  icon,
}: {
  children: ReactNode;
  icon: IconSvgElement;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <HugeiconsIcon
        aria-hidden
        className="shrink-0"
        color="currentColor"
        icon={icon}
        size={14}
        strokeWidth={1.9}
      />
      <span className="truncate">{children}</span>
    </span>
  );
}

function buildBusinessAttributionItems(
  detail: InsightDetailResponse,
): InsightResultItem[] {
  const sentimentItems = detail.sentiment.filter((item) => item.reason);

  return [
    {
      icon: AiIdeaIcon,
      items: detail.intents.map((item) => item.intentLabel),
      label: "意图",
    },
    {
      icon: Database01Icon,
      items: detail.entities.map((item) => item.entityName),
      label: "实体",
    },
    {
      icon: Tag01Icon,
      items: detail.tags.map((item) => item.tagName),
      label: "标签",
    },
    {
      display: "text",
      icon: SmileIcon,
      items: sentimentItems.map((item) => item.reason),
      label: "情绪",
      sentimentItems: sentimentItems.map((item) => ({
        polarity: item.polarity,
        reason: item.reason,
      })),
    },
  ];
}

function getPolarityConfig(polarity: string) {
  if (polarity === "positive") {
    return {
      className: "bg-success-muted/55 text-success",
      icon: LookTopIcon,
      label: "正向",
    };
  }

  if (polarity === "negative") {
    return {
      className: "bg-destructive-muted/55 text-destructive",
      icon: Sad02Icon,
      label: "负向",
    };
  }

  if (polarity === "mixed") {
    return {
      className: "bg-warning-muted/55 text-warning",
      icon: CrazyIcon,
      label: "混合",
    };
  }

  if (polarity === "neutral") {
    return {
      className: "bg-muted text-muted-foreground",
      icon: FlushedIcon,
      label: "中性",
    };
  }

  return {
    className: "bg-muted text-muted-foreground",
    icon: SmileIcon,
    label: "未知",
  };
}
