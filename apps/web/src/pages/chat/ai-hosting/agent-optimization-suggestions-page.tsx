import { useEffect, useState } from "react";
import type { AiHostingLearningCandidateItem } from "@chatai/contracts";
import {
  AiIdeaIcon,
  AiMagicIcon,
  Add01Icon,
  ArrowLeft01Icon,
  InboxDownloadIcon,
  UnavailableIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { cn } from "@/lib/utils";
import { isRequestError } from "@/lib/request";
import { Textarea } from "@/components/ui/textarea";
import { AiHostingLayout } from "./ai-hosting-layout";
import {
  approveAgentLearningCandidate,
  batchApproveAgentLearningCandidates,
  batchRejectAgentLearningCandidates,
  listAgentLearningCandidates,
  rejectAgentLearningCandidate,
} from "./api/agent-learning-service";
import {
  listKbDocs,
  listKbs,
  toKbDocViewItem,
  toKbListViewItem,
} from "./api/kb-service";
import type { KbDocViewItem, KbListViewItem } from "./kb-types";

type SuggestionStatus = AiHostingLearningCandidateItem["status"];
type IngestMode = "batch" | "single";
const ADD_KNOWLEDGE_OPTION_VALUE = "__add_knowledge__";
const PAGE_SIZE = 10;

const suggestionTabs: Array<{ label: string; value: SuggestionStatus }> = [
  { label: "待处理", value: "pending" },
  { label: "已入库", value: "adopted" },
  { label: "已忽略", value: "ignored" },
  { label: "智能过滤", value: "filtered" },
];

export function AgentOptimizationSuggestionsPage() {
  const navigate = useNavigate();
  const { agentId = "" } = useParams();
  const [activeStatus, setActiveStatus] = useState<SuggestionStatus>("pending");
  const [batchMode, setBatchMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [candidates, setCandidates] = useState<AiHostingLearningCandidateItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [listVersion, setListVersion] = useState(0);
  const [ingestMode, setIngestMode] = useState<IngestMode | null>(null);
  const [ingestTargetIds, setIngestTargetIds] = useState<string[]>([]);
  const [ingestQuestion, setIngestQuestion] = useState("");
  const [ingestAnswer, setIngestAnswer] = useState("");
  const [ingestSubmitting, setIngestSubmitting] = useState(false);
  const [ignoreConfirmationOpen, setIgnoreConfirmationOpen] = useState(false);
  const [ignoreTargetIds, setIgnoreTargetIds] = useState<string[]>([]);
  const [ignoreSubmitting, setIgnoreSubmitting] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<KbListViewItem[]>([]);
  const [knowledgeBasesLoading, setKnowledgeBasesLoading] = useState(true);
  const [knowledgeItems, setKnowledgeItems] = useState<KbDocViewItem[]>([]);
  const [knowledgeItemsLoading, setKnowledgeItemsLoading] = useState(false);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState("");
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: PAGE_SIZE,
    total,
  });
  const canBatchOperate = activeStatus !== "adopted";
  const canSelect = canBatchOperate && batchMode;

  function toggleSuggestion(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((itemId) => itemId !== id),
    );
  }

  function openIngestDialog(mode: IngestMode, ids: string[]) {
    const first = candidates.find((item) => item.id === ids[0]);
    setIngestMode(mode);
    setIngestTargetIds(ids);
    setIngestQuestion(first?.question ?? "");
    setIngestAnswer(first?.answer ?? "");
    setSelectedKnowledgeBaseId("");
    setSelectedKnowledgeId("");
  }

  function refreshList() {
    setListVersion((value) => value + 1);
  }

  const selectedKnowledgeBase = knowledgeBases.find(
    (knowledgeBase) => knowledgeBase.id === selectedKnowledgeBaseId,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadKnowledgeBases() {
      setKnowledgeBasesLoading(true);

      try {
        const response = await listKbs({ page: 1, pageSize: 100 });

        if (!cancelled) {
          setKnowledgeBases(response.kbs.map(toKbListViewItem));
        }
      } catch {
        if (!cancelled) {
          setKnowledgeBases([]);
        }
      } finally {
        if (!cancelled) {
          setKnowledgeBasesLoading(false);
        }
      }
    }

    void loadKnowledgeBases();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!agentId) {
      return;
    }

    let cancelled = false;

    async function loadCandidates() {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await listAgentLearningCandidates(agentId, {
          page: activePage,
          pageSize: PAGE_SIZE,
          status: activeStatus,
        });

        if (!cancelled) {
          setCandidates(response.candidates);
          setTotal(response.pagination.total);
        }
      } catch (error) {
        if (!cancelled) {
          setCandidates([]);
          setTotal(0);
          setErrorMessage(isRequestError(error) ? error.message : "加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCandidates();

    return () => {
      cancelled = true;
    };
  }, [activePage, activeStatus, agentId, listVersion]);

  useEffect(() => {
    if (!ingestMode || !selectedKnowledgeBaseId) {
      setKnowledgeItems([]);
      return;
    }

    let cancelled = false;

    async function loadKnowledgeItems() {
      setKnowledgeItemsLoading(true);

      try {
        const response = await listKbDocs(selectedKnowledgeBaseId, {
          page: 1,
          pageSize: 100,
        });

        if (!cancelled) {
          setKnowledgeItems(response.docs.map(toKbDocViewItem));
        }
      } catch {
        if (!cancelled) {
          setKnowledgeItems([]);
        }
      } finally {
        if (!cancelled) {
          setKnowledgeItemsLoading(false);
        }
      }
    }

    void loadKnowledgeItems();

    return () => {
      cancelled = true;
    };
  }, [ingestMode, selectedKnowledgeBaseId]);

  async function handleConfirmIngest() {
    if (
      !agentId ||
      !selectedKnowledgeBaseId ||
      !selectedKnowledgeId ||
      ingestTargetIds.length === 0 ||
      ingestSubmitting
    ) {
      return;
    }

    setIngestSubmitting(true);

    try {
      if (ingestMode === "single") {
        const question = ingestQuestion.trim();
        const answer = ingestAnswer.trim();

        if (!question || !answer) {
          toast.error("请填写问题和答案");
          return;
        }

        await approveAgentLearningCandidate(agentId, ingestTargetIds[0], {
          answer,
          question,
          targetDocId: selectedKnowledgeId,
          targetKbId: selectedKnowledgeBaseId,
        });
        toast.success("已入库");
      } else {
        const result = await batchApproveAgentLearningCandidates(agentId, {
          ids: ingestTargetIds,
          targetDocId: selectedKnowledgeId,
          targetKbId: selectedKnowledgeBaseId,
        });

        if (result.failDetails.length > 0) {
          toast.error(`成功 ${result.successCount} 条，失败 ${result.failDetails.length} 条`);
        } else {
          toast.success(`已入库 ${result.successCount} 条`);
        }
      }

      setIngestMode(null);
      setSelectedIds([]);
      setBatchMode(false);
      refreshList();
    } catch (error) {
      toast.error(isRequestError(error) ? error.message : "入库失败");
    } finally {
      setIngestSubmitting(false);
    }
  }

  async function handleConfirmIgnore() {
    if (!agentId || ignoreTargetIds.length === 0 || ignoreSubmitting) {
      return;
    }

    setIgnoreSubmitting(true);

    try {
      if (ignoreTargetIds.length === 1 && !batchMode) {
        await rejectAgentLearningCandidate(agentId, ignoreTargetIds[0]);
        toast.success("已忽略");
      } else {
        const result = await batchRejectAgentLearningCandidates(agentId, {
          ids: ignoreTargetIds,
        });
        toast.success(`已忽略 ${result.updatedCount} 条`);
      }

      setIgnoreConfirmationOpen(false);
      setIgnoreTargetIds([]);
      setSelectedIds([]);
      setBatchMode(false);
      refreshList();
    } catch (error) {
      toast.error(isRequestError(error) ? error.message : "忽略失败");
    } finally {
      setIgnoreSubmitting(false);
    }
  }

  return (
    <AiHostingLayout title="AI 优化建议">
      <div className="space-y-6">
        <div className="space-y-3">
          <Link
            className="inline-flex items-center gap-1 text-sm text-muted-foreground no-underline hover:text-foreground"
            to="/chat/ai-hosting/agents"
          >
            <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} size={16} strokeWidth={1.8} />
            返回 Agent 管理
          </Link>
          <h1 className="text-[22px] font-semibold leading-tight text-foreground">AI 优化建议</h1>
        </div>

        <section aria-label="优化建议列表" className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-[10px] bg-muted p-1">
              {suggestionTabs.map((tab) => (
                <Button
                  className={cn(
                    "h-8 rounded-[8px] px-3 text-sm font-normal",
                    activeStatus === tab.value
                      ? "bg-background text-foreground shadow-sm hover:bg-background"
                      : "text-muted-foreground",
                  )}
                  key={tab.value}
                  onClick={() => {
                    setActiveStatus(tab.value);
                    setBatchMode(false);
                    setSelectedIds([]);
                    setCurrentPage(1);
                  }}
                  type="button"
                  variant="ghost"
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            {batchMode ? (
              <div className="flex items-center gap-3">
                <Button
                  disabled={selectedIds.length === 0}
                  onClick={() => openIngestDialog("batch", selectedIds)}
                  type="button"
                  variant="outline"
                >
                  批量入库
                </Button>
                {activeStatus === "pending" ? (
                  <Button
                    disabled={selectedIds.length === 0}
                    onClick={() => {
                      setIgnoreTargetIds(selectedIds);
                      setIgnoreConfirmationOpen(true);
                    }}
                    type="button"
                    variant="outline"
                  >
                    批量忽略
                  </Button>
                ) : null}
                <Button
                  className="h-auto p-0 text-primary"
                  onClick={() => {
                    setBatchMode(false);
                    setSelectedIds([]);
                  }}
                  type="button"
                  variant="link"
                >
                  退出操作
                </Button>
              </div>
            ) : canBatchOperate ? (
              <Button
                className="h-auto p-0 text-primary"
                onClick={() => setBatchMode(true)}
                type="button"
                variant="link"
              >
                批量操作
              </Button>
            ) : null}
          </div>

          {activeStatus === "filtered" ? (
            <div className="flex items-center gap-2 rounded-[8px] bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
              <HugeiconsIcon
                aria-hidden="true"
                className="text-primary"
                icon={AiMagicIcon}
                size={16}
                strokeWidth={1.8}
              />
              Agent在使用过程中会自主学习并提炼出有价值的知识，再经过AI评判功能，智能过滤掉重复或冲突的知识
            </div>
          ) : null}

          {loading ? (
            <div
              className="flex min-h-[240px] items-center justify-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <Spinner />
              正在加载
            </div>
          ) : errorMessage ? (
            <div className="flex min-h-[240px] items-center justify-center text-sm text-destructive">
              {errorMessage}
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
              暂无数据
            </div>
          ) : (
            <div
              className={cn(
                "grid grid-cols-1 gap-4",
                activeStatus === "filtered" ? "xl:grid-cols-2" : "xl:grid-cols-2",
              )}
            >
              {candidates.map((suggestion) => (
                <SuggestionCard
                  checked={selectedIds.includes(suggestion.id)}
                  key={suggestion.id}
                  onAdopt={() => openIngestDialog("single", [suggestion.id])}
                  onCheckedChange={(checked) => toggleSuggestion(suggestion.id, checked)}
                  onIgnore={() => {
                    setIgnoreTargetIds([suggestion.id]);
                    setIgnoreConfirmationOpen(true);
                  }}
                  selectable={canSelect}
                  status={activeStatus}
                  suggestion={suggestion}
                />
              ))}
            </div>
          )}
        </section>

        <TablePagination
          className="border-t-0"
          onPageChange={setCurrentPage}
          page={activePage}
          total={total}
          totalPages={totalPages}
        />
      </div>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !ignoreSubmitting) {
            setIgnoreConfirmationOpen(false);
            setIgnoreTargetIds([]);
          }
        }}
        open={ignoreConfirmationOpen}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>是否确认忽略?</AlertDialogTitle>
            <AlertDialogDescription>
              已忽略的，后续也可前往已忽略列表中重新入库
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ignoreSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={ignoreSubmitting}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmIgnore();
              }}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        onOpenChange={(open) => {
          if (!open && !ingestSubmitting) {
            setIngestMode(null);
          }
        }}
        open={ingestMode != null}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>入库</DialogTitle>
            <DialogDescription className="sr-only">
              选择知识库和知识后确认入库
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="optimization-kb-select">
                选择知识库 <span className="text-destructive">*</span>
              </Label>
              <Select
                disabled={knowledgeBasesLoading || ingestSubmitting}
                onValueChange={(value) => {
                  setSelectedKnowledgeBaseId(value);
                  setSelectedKnowledgeId("");
                }}
                value={selectedKnowledgeBaseId}
              >
                <SelectTrigger className="w-full" id="optimization-kb-select">
                  <SelectValue
                    placeholder={knowledgeBasesLoading ? "正在加载" : "请选择将保存至哪个知识库"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {knowledgeBases.map((knowledgeBase) => (
                    <SelectItem key={knowledgeBase.id} value={knowledgeBase.id}>
                      {knowledgeBase.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="optimization-knowledge-select">
                选择知识 <span className="text-destructive">*</span>
              </Label>
              <Select
                disabled={!selectedKnowledgeBase || knowledgeItemsLoading || ingestSubmitting}
                onValueChange={(value) => {
                  if (value === ADD_KNOWLEDGE_OPTION_VALUE && selectedKnowledgeBase) {
                    setIngestMode(null);
                    navigate(`/chat/ai-hosting/kb/${selectedKnowledgeBase.id}?addKnowledge=qa:new`);
                    return;
                  }

                  setSelectedKnowledgeId(value);
                }}
                value={selectedKnowledgeId}
              >
                <SelectTrigger className="w-full" id="optimization-knowledge-select">
                  <SelectValue
                    placeholder={
                      knowledgeItemsLoading ? "正在加载" : "请选择将保存至哪个知识"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    className="h-9 pl-3 text-primary focus:bg-primary/5 focus:text-primary"
                    value={ADD_KNOWLEDGE_OPTION_VALUE}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <HugeiconsIcon aria-hidden="true" icon={Add01Icon} size={14} strokeWidth={1.8} />
                      <span>添加知识</span>
                    </span>
                  </SelectItem>
                  <SelectSeparator />
                  {knowledgeItems.map((knowledge) => {
                    const disabled = knowledge.status === "queued" || knowledge.status === "failed";

                    return (
                      <SelectItem
                        aria-disabled={disabled}
                        disabled={disabled}
                        key={knowledge.id}
                        value={knowledge.id}
                      >
                        <span className="inline-flex items-center gap-2">
                          {knowledge.nameWithExtension}
                          {disabled ? (
                            <span className="text-xs text-muted-foreground">
                              {knowledge.status === "queued" ? "排队中" : "失败"}
                            </span>
                          ) : null}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            {ingestMode === "single" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="optimization-question">
                    问题 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    disabled={ingestSubmitting}
                    id="optimization-question"
                    onChange={(event) => setIngestQuestion(event.target.value)}
                    value={ingestQuestion}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="optimization-answer">
                    答案 <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    className="min-h-24 resize-none"
                    disabled={ingestSubmitting}
                    id="optimization-answer"
                    onChange={(event) => setIngestAnswer(event.target.value)}
                    value={ingestAnswer}
                  />
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              disabled={ingestSubmitting}
              onClick={() => setIngestMode(null)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button
              disabled={
                !selectedKnowledgeBaseId ||
                !selectedKnowledgeId ||
                ingestSubmitting ||
                (ingestMode === "single" && (!ingestQuestion.trim() || !ingestAnswer.trim()))
              }
              onClick={() => {
                void handleConfirmIngest();
              }}
              type="button"
            >
              确认入库
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AiHostingLayout>
  );
}

function SuggestionCard({
  checked = false,
  onAdopt,
  onCheckedChange,
  onIgnore,
  selectable = false,
  status,
  suggestion,
}: {
  checked?: boolean;
  onAdopt?: () => void;
  onCheckedChange?: (checked: boolean) => void;
  onIgnore?: () => void;
  selectable?: boolean;
  status?: SuggestionStatus;
  suggestion: AiHostingLearningCandidateItem;
}) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-warning-muted text-warning">
            <HugeiconsIcon aria-hidden="true" icon={AiIdeaIcon} size={13} strokeWidth={1.8} />
          </span>
          <h2 className="truncate text-sm font-medium text-foreground">{suggestion.question}</h2>
        </div>
        {selectable ? (
          <Checkbox
            aria-label={`选择建议：${suggestion.question}`}
            checked={checked}
            onCheckedChange={(nextChecked) => onCheckedChange?.(nextChecked === true)}
          />
        ) : status === "pending" ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              className="h-7 rounded-[6px] px-2 text-xs"
              onClick={onAdopt}
              type="button"
              variant="outline"
            >
              <HugeiconsIcon aria-hidden="true" icon={InboxDownloadIcon} size={14} strokeWidth={1.8} />
              入库
            </Button>
            <Button
              className="h-7 rounded-[6px] px-2 text-xs"
              onClick={onIgnore}
              type="button"
              variant="outline"
            >
              <HugeiconsIcon aria-hidden="true" icon={UnavailableIcon} size={14} strokeWidth={1.8} />
              忽略
            </Button>
          </div>
        ) : status === "ignored" || status === "filtered" ? (
          <Button
            className="h-7 shrink-0 rounded-[6px] px-2 text-xs"
            onClick={onAdopt}
            type="button"
            variant="outline"
          >
            <HugeiconsIcon aria-hidden="true" icon={InboxDownloadIcon} size={14} strokeWidth={1.8} />
            入库
          </Button>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-foreground">{suggestion.answer}</p>
      <div className="mt-3 rounded-[8px] bg-success-muted/55 px-3 py-2">
        <p className="text-xs text-success">
          {status === "filtered" ? "AI过滤理由" : "入库理由"}
        </p>
        <p className="mt-1 line-clamp-1 text-sm text-foreground">{suggestion.rationale}</p>
      </div>
      <div className="mt-auto flex items-center justify-between pt-3">
        <div className="flex items-center gap-1.5">
          <Avatar className="size-5 rounded-full">
            <AvatarImage alt={suggestion.seat?.name} src={suggestion.seat?.avatar} />
            <AvatarFallback className="size-5 rounded-full text-[10px]" />
          </Avatar>
          <span className="text-xs text-muted-foreground">与</span>
          <Avatar className="size-5 rounded-full">
            <AvatarImage alt={suggestion.user?.name} src={suggestion.user?.avatar} />
            <AvatarFallback className="size-5 rounded-full text-[10px]" />
          </Avatar>
        </div>
        {suggestion.createdAt ? (
          <time
            className="text-xs text-muted-foreground"
            dateTime={new Date(suggestion.createdAt).toISOString()}
          >
            {formatDateTime(suggestion.createdAt)}
          </time>
        ) : null}
      </div>
    </article>
  );
}

function formatDateTime(value: number) {
  const date = new Date(value);
  const pad = (input: number) => String(input).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
