import type { ReactNode } from "react";
import type {
  InsightDetailResponse,
  InsightMessageContextResponse,
} from "@chatai/contracts";
import {
  AiIdeaIcon,
  Analytics02Icon,
  ClipboardCheckIcon,
  Database01Icon,
  Layers01Icon,
  SmileIcon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { adaptMessage } from "@/pages/chat/api/workbench-adapter";
import { HistoryCompactMessageList } from "@/pages/chat/components/message-history-side-panel";
import type { Account, CustomerProfile } from "@/pages/chat/chat-types";
import { ResolutionBadge } from "./insight-badges";
import { InsightPerson } from "./insight-person";
import { formatInsightTime } from "./insights-utils";

export function InsightDetailPanel({
  detail,
  error,
  isOpen,
  isLoading,
  onOpenChange,
}: {
  detail?: InsightDetailResponse;
  error?: Error;
  isOpen: boolean;
  isLoading?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const evidenceRecordMessages = detail
    ? adaptInsightMessages(detail.sessionMessageRecords)
    : [];
  const evidenceByMessageId = detail ? buildEvidenceByMessageId(detail.evidenceItems) : new Map<string, EvidenceViewItem[]>();
  const showIntent = Boolean(
    detail?.summary.customerIntent
      && !isSimilarText(detail.summary.customerIntent, detail.problemResolution.problemSummary),
  );

  return (
    <Sheet onOpenChange={onOpenChange} open={isOpen}>
      <SheetContent className="w-full overflow-hidden sm:max-w-[min(1180px,calc(100vw-48px))]">
          <SheetTitle className="sr-only">洞察详情</SheetTitle>
          <SheetDescription className="sr-only">
            查看本轮咨询会话的分析结果和对话证据
          </SheetDescription>

          {detail ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <section className="border-b bg-muted/20 px-6 py-4 pr-16">
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                      <InsightPerson
                        avatarUrl={detail.session.customerAvatarUrl}
                        name={detail.session.customerName}
                        size="sm"
                      />
                      <span className="text-xs text-muted-foreground">由</span>
                      <InsightPerson
                        avatarUrl={detail.session.agentAvatarUrl}
                        name={detail.session.agentName ?? "未分配客服"}
                        roleLabel="客服"
                        size="sm"
                      />
                    </div>
                  </div>
                  <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
                    {detail.problemResolution.problemSummary || "暂无客户问题摘要"}
                  </p>
                  <div className="text-xs text-muted-foreground">
                    生成于 {formatInsightTime(detail.session.generatedAt)}
                  </div>
                </div>
              </section>

              <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_420px]">
                <div className="min-h-0 overflow-y-auto px-6 py-5">
                  <section
                    aria-label="洞察结论"
                    className="max-w-[880px] space-y-5"
                    role="region"
                  >
                    <div className="space-y-4">
                      <div className="space-y-4">
                        <SummaryBlock
                          labelExtra={(
                            <ResolutionBadge status={detail.problemResolution.resolutionStatus} />
                          )}
                          label="当前结果"
                          strong
                          value={detail.summary.resultSummary}
                        />
                        <SummaryBlock
                          label="处理过程"
                          value={detail.summary.processSummary}
                        />
                        {detail.summary.followUp ? (
                          <SummaryBlock
                            label="跟进建议"
                            value={detail.summary.followUp}
                          />
                        ) : null}
                      </div>

                      {detail.problemResolution.unresolvedReason ? (
                        <div className="rounded-[8px] border border-destructive/20 bg-destructive/5 px-4 py-3">
                          <div className="text-xs font-medium text-destructive">
                            未解决判定理由
                          </div>
                          <p className="mt-1.5 text-sm leading-6 text-foreground">
                            {detail.problemResolution.unresolvedReason}
                          </p>
                        </div>
                      ) : null}

                    </div>

                    <div className="space-y-4 border-t pt-5">
                      <h3 className="text-sm font-semibold text-foreground">
                        提取结果
                      </h3>
                      <InsightResultTable
                        items={buildInsightResultItems(detail, showIntent)}
                      />
                      {detail.faqCandidates.length > 0 ? (
                        <InsightFaqList
                          items={detail.faqCandidates.map((item) => item.question)}
                        />
                      ) : null}
                    </div>
                  </section>
                </div>

                <aside
                  aria-label="本轮对话"
                  className="min-h-0 border-l bg-muted/20"
                  role="region"
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex items-center justify-between border-b bg-background px-5 py-4">
                      <h3 className="text-sm font-semibold text-foreground">
                        本轮对话
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {evidenceRecordMessages.length} 条
                      </span>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                      {evidenceRecordMessages.length > 0 ? (
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
            </div>
          ) : (
            <div className="px-6 py-8 text-sm text-muted-foreground">
              {isLoading ? "正在加载洞察详情" : error ? "洞察详情加载失败" : "暂无洞察详情"}
            </div>
          )}
      </SheetContent>
    </Sheet>
  );
}

function adaptInsightMessages(messages: InsightMessageContextResponse["messages"]) {
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

function SummaryBlock({
  label,
  labelExtra,
  strong,
  value,
}: {
  label: string;
  labelExtra?: ReactNode;
  strong?: boolean;
  value: string;
}) {
  return (
    <div className={cn("space-y-1.5", strong ? "max-w-3xl" : "max-w-4xl")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {labelExtra}
      </div>
      <p
        className={cn(
          "text-foreground",
          strong ? "text-base font-medium leading-7" : "text-sm leading-6",
        )}
      >
        {value || "暂无"}
      </p>
    </div>
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

function isSimilarText(left: string, right: string) {
  const normalizedLeft = normalizeComparableText(left);
  const normalizedRight = normalizeComparableText(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return normalizedLeft.includes(normalizedRight)
    || normalizedRight.includes(normalizedLeft);
}

function normalizeComparableText(value: string) {
  return value.replace(/[，。！？、\s]/g, "").trim();
}

type InsightResultItem = {
  display?: "badge" | "text";
  icon: IconSvgElement;
  items: string[];
  label: string;
};

function InsightResultTable({
  items,
}: {
  items: InsightResultItem[];
}) {
  const visibleItems = items.filter((item) => item.items.length > 0);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <dl className="divide-y rounded-[8px] border bg-background">
      {visibleItems.map((item) => (
        <div
          className="grid gap-2 px-3 py-3 sm:grid-cols-[5.5rem_minmax(0,1fr)]"
          key={item.label}
        >
          <dt className="text-xs leading-6 text-muted-foreground">
            <SectionLabel icon={item.icon}>{item.label}</SectionLabel>
          </dt>
          <dd className="flex min-w-0 flex-wrap gap-2">
            {item.items.map((value) =>
              item.display === "text" ? (
                <span
                  className="min-w-0 text-sm leading-6 text-foreground"
                  key={`${item.label}:${value}`}
                >
                  {value}
                </span>
              ) : (
                <Badge
                  className="max-w-full whitespace-normal rounded-[8px] px-2.5 py-1 text-[13px] font-normal leading-5"
                  key={`${item.label}:${value}`}
                  variant="secondary"
                >
                  {value}
                </Badge>
              )
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function InsightFaqList({ items }: { items: string[] }) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground">FAQ 机会</div>
      <ol className="space-y-2">
        {items.map((item, index) => (
          <li
            className="grid gap-2 rounded-[8px] bg-muted/45 px-3 py-2 text-sm leading-6 text-foreground sm:grid-cols-[2rem_minmax(0,1fr)]"
            key={item}
          >
            <span className="text-xs leading-6 text-muted-foreground">
              {index + 1}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </div>
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

function buildInsightResultItems(
  detail: InsightDetailResponse,
  showIntent: boolean,
): InsightResultItem[] {
  return [
    {
      icon: AiIdeaIcon,
      items: showIntent ? [detail.summary.customerIntent] : [],
      label: "意图",
    },
    {
      icon: Layers01Icon,
      items: detail.intents.map((item) => item.intentLabel),
      label: "细分",
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
      items: detail.sentiment.map(
        (item) => `${formatPolarity(item.polarity)}：${item.reason}`,
      ),
      label: "情绪",
    },
    {
      icon: ClipboardCheckIcon,
      items: detail.qaFindings.map((item) =>
        `${item.passed ? "通过" : "未通过"}：${item.ruleCode}`,
      ),
      label: "质检",
    },
    {
      icon: Analytics02Icon,
      items: detail.actionItems.map((item) => item.title),
      label: "待办",
    },
  ];
}
function formatPolarity(polarity: string) {
  if (polarity === "positive") {
    return "正向";
  }

  if (polarity === "negative") {
    return "负向";
  }

  if (polarity === "mixed") {
    return "混合";
  }

  if (polarity === "neutral") {
    return "中性";
  }

  return "未知";
}
