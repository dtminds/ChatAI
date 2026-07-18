import { useEffect, useRef, useState } from "react";
import type { AiHostingLearningCandidateItem } from "@chatai/contracts";
import {
  AiMagicIcon,
  Add01Icon,
  ArrowLeft01Icon,
  BubbleChatQuestionIcon,
  InboxDownloadIcon,
  Refresh03Icon,
  UnavailableIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useParams } from "react-router-dom";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
const PAGE_SIZE = 10;

const suggestionTabs: Array<{ label: string; value: SuggestionStatus }> = [
  { label: "待处理", value: "pending" },
  { label: "已入库", value: "adopted" },
  { label: "已忽略", value: "ignored" },
  { label: "智能过滤", value: "filtered" },
];

function RefreshListButton({
  disabled,
  label,
  loading,
  onClick,
}: {
  disabled: boolean;
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className="size-7 p-0"
          disabled={disabled}
          onClick={onClick}
          size="icon"
          type="button"
          variant="ghost"
        >
          {loading ? (
            <Spinner className="size-4" />
          ) : (
            <HugeiconsIcon
              aria-hidden="true"
              icon={Refresh03Icon}
              size={16}
              strokeWidth={1.8}
            />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function AgentOptimizationSuggestionsPage() {
  const { agentId = "" } = useParams();
  const knowledgeBaseSelectRef = useRef<HTMLButtonElement>(null);
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

  async function handleRefreshKnowledgeBases() {
    if (knowledgeBasesLoading || ingestSubmitting) {
      return;
    }

    setKnowledgeBasesLoading(true);

    try {
      const response = await listKbs({ page: 1, pageSize: 100 });
      const refreshedKnowledgeBases = response.kbs.map(toKbListViewItem);

      setKnowledgeBases(refreshedKnowledgeBases);

      if (
        selectedKnowledgeBaseId &&
        !refreshedKnowledgeBases.some(
          (knowledgeBase) => knowledgeBase.id === selectedKnowledgeBaseId,
        )
      ) {
        setSelectedKnowledgeBaseId("");
        setSelectedKnowledgeId("");
        setKnowledgeItems([]);
      }
    } catch {
      toast.error("刷新知识库失败");
    } finally {
      setKnowledgeBasesLoading(false);
    }
  }

  async function handleRefreshKnowledgeItems() {
    if (!selectedKnowledgeBaseId || knowledgeItemsLoading || ingestSubmitting) {
      return;
    }

    setKnowledgeItemsLoading(true);

    try {
      const response = await listKbDocs(selectedKnowledgeBaseId, {
        page: 1,
        pageSize: 100,
      });
      const refreshedKnowledgeItems = response.docs.map(toKbDocViewItem);

      setKnowledgeItems(refreshedKnowledgeItems);

      if (
        selectedKnowledgeId &&
        !refreshedKnowledgeItems.some(
          (knowledgeItem) => knowledgeItem.id === selectedKnowledgeId,
        )
      ) {
        setSelectedKnowledgeId("");
      }
    } catch {
      toast.error("刷新知识失败");
    } finally {
      setKnowledgeItemsLoading(false);
    }
  }

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
              Agent 会基于对话自主学习并提炼出有价值的知识，并进行自动评测，留下有效的知识待人工核实
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
        <DialogContent
          className="max-w-xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            knowledgeBaseSelectRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>入库</DialogTitle>
            <DialogDescription className="sr-only">
              选择知识库和知识后确认入库
            </DialogDescription>
          </DialogHeader>
          <TooltipProvider>
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="optimization-kb-select">
                    选择知识库 <span className="text-destructive">*</span>
                  </Label>
                  <RefreshListButton
                    disabled={knowledgeBasesLoading || ingestSubmitting}
                    label="刷新知识库列表"
                    loading={knowledgeBasesLoading}
                    onClick={() => {
                      void handleRefreshKnowledgeBases();
                    }}
                  />
                </div>
                <Select
                  disabled={knowledgeBasesLoading || ingestSubmitting}
                  onValueChange={(value) => {
                    setSelectedKnowledgeBaseId(value);
                    setSelectedKnowledgeId("");
                  }}
                  value={selectedKnowledgeBaseId}
                >
                  <SelectTrigger
                    className="w-full"
                    id="optimization-kb-select"
                    ref={knowledgeBaseSelectRef}
                  >
                    <SelectValue
                      placeholder={
                        knowledgeBasesLoading ? "正在加载" : "请选择"
                      }
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
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="optimization-knowledge-select">
                    选择知识 <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label="添加知识"
                          className="size-7 p-0"
                          disabled={!selectedKnowledgeBase || ingestSubmitting}
                          onClick={() => {
                            if (!selectedKnowledgeBase) {
                              return;
                            }

                            window.open(
                              `/chat/ai-hosting/kb/${selectedKnowledgeBase.id}?addKnowledge=qa:new`,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <HugeiconsIcon
                            aria-hidden="true"
                            icon={Add01Icon}
                            size={16}
                            strokeWidth={1.8}
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>添加知识</TooltipContent>
                    </Tooltip>
                    <RefreshListButton
                      disabled={
                        !selectedKnowledgeBase || knowledgeItemsLoading || ingestSubmitting
                      }
                      label="刷新知识列表"
                      loading={knowledgeItemsLoading}
                      onClick={() => {
                        void handleRefreshKnowledgeItems();
                      }}
                    />
                  </div>
                </div>
                <Select
                  disabled={!selectedKnowledgeBase || knowledgeItemsLoading || ingestSubmitting}
                  onValueChange={setSelectedKnowledgeId}
                  value={selectedKnowledgeId}
                >
                  <SelectTrigger className="w-full" id="optimization-knowledge-select">
                    <SelectValue
                      placeholder={
                        knowledgeItemsLoading ? "正在加载" : "请选择"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {knowledgeItems.length === 0 ? (
                      <div
                        className="flex h-9 items-center justify-center px-3 text-sm text-muted-foreground"
                        role="status"
                      >
                        暂无数据
                      </div>
                    ) : (
                      knowledgeItems.map((knowledge) => {
                        const disabled =
                          knowledge.status === "queued" || knowledge.status === "failed";

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
                      })
                    )}
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
          </TooltipProvider>
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
          <HugeiconsIcon
            aria-hidden="true"
            className="shrink-0 text-foreground"
            icon={BubbleChatQuestionIcon}
            size={18}
            strokeWidth={1.8}
          />
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
      <p className="mt-3 h-18 line-clamp-3 text-sm leading-6 text-foreground">
        {suggestion.answer}
      </p>
      <div className="mt-3 rounded-[8px] bg-success-muted/55 px-3 py-2">
        <p className="text-xs text-success">
          {status === "filtered" ? "AI过滤理由" : "AI 评测"}
        </p>
        <p className="mt-1 line-clamp-1 text-xs text-foreground">{suggestion.rationale}</p>
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
