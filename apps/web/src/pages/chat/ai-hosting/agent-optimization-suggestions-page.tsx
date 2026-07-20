import { useEffect, useRef, useState } from "react";
import {
  KB_SEARCH_QUERY_MAX_LENGTH,
  type AiHostingLearningCandidateItem,
  type AiHostingLearningCandidateSearchDetailItem,
} from "@chatai/contracts";
import {
  AiChemistry02Icon,
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Knowledge02Icon,
  OkFingerIcon,
  Refresh03Icon,
  Search01Icon,
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
import { Badge } from "@/components/ui/badge";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  getAgentLearningCandidateSearchDetail,
  rejectAgentLearningCandidate,
} from "./api/agent-learning-service";
import {
  listKbDocs,
  listKbs,
  toKbDocViewItem,
  toKbListViewItem,
} from "./api/kb-service";
import type { KbDocViewItem, KbListViewItem } from "./kb-types";
import { useAuthStore } from "@/store/auth-store";
import { canManageAiHostingAgents } from "./agent-permissions";
import { KbTableLoadingRow } from "./kb-components/kb-table-loading-row";
import { FileExtensionBadge } from "@/pages/chat/components/message/file";

type SuggestionStatus = AiHostingLearningCandidateItem["status"];
type IngestMode = "batch" | "single";
const PAGE_SIZE = 10;
const KNOWLEDGE_PICKER_PAGE_SIZE = 10;
const VERY_HIGH_CONFIDENCE_THRESHOLD = 0.9;
const HIGH_CONFIDENCE_THRESHOLD = 0.7;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

const suggestionTabs: Array<{ label: string; value: SuggestionStatus }> = [
  { label: "待处理", value: "pending" },
  { label: "已采纳", value: "adopted" },
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
  const role = useAuthStore((state) => state.subUser?.role);
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
  const [knowledgePickerOpen, setKnowledgePickerOpen] = useState(false);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState("");
  const [selectedKnowledge, setSelectedKnowledge] = useState<KbDocViewItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchDetailCandidateId, setSearchDetailCandidateId] = useState<string | null>(null);
  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: PAGE_SIZE,
    total,
  });
  const canManage = canManageAiHostingAgents(role);
  const canBatchOperate = canManage && activeStatus !== "adopted";
  const canSelect = canBatchOperate && batchMode;
  const ingestPreviewCandidate =
    ingestMode === "single"
      ? candidates.find((candidate) => candidate.id === ingestTargetIds[0]) ?? null
      : null;

  function toggleSuggestion(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((itemId) => itemId !== id),
    );
  }

  function openIngestDialog(mode: IngestMode, ids: string[]) {
    if (!canManage) {
      return;
    }

    const first = candidates.find((item) => item.id === ids[0]);
    setIngestMode(mode);
    setIngestTargetIds(ids);
    setIngestQuestion(first?.question ?? "");
    setIngestAnswer(first?.answer ?? "");
    setSelectedKnowledgeBaseId("");
    setSelectedKnowledge(null);
    setKnowledgePickerOpen(false);
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
        setSelectedKnowledge(null);
        setKnowledgePickerOpen(false);
      }
    } catch {
      toast.error("刷新知识库失败");
    } finally {
      setKnowledgeBasesLoading(false);
    }
  }

  async function handleConfirmIngest() {
    if (
      !agentId ||
      !selectedKnowledgeBaseId ||
      !selectedKnowledge ||
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
          targetDocId: selectedKnowledge.id,
          targetKbId: selectedKnowledgeBaseId,
        });
        toast.success("已入库");
      } else {
        const result = await batchApproveAgentLearningCandidates(agentId, {
          ids: ingestTargetIds,
          targetDocId: selectedKnowledge.id,
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
    <AiHostingLayout title="Agent 自主进化">
      <div className="space-y-6">
        <div className="space-y-3">
          <Link
            className="inline-flex items-center gap-1 text-sm text-muted-foreground no-underline hover:text-foreground"
            to="/chat/ai-hosting/agents"
          >
            <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} size={16} strokeWidth={1.8} />
            返回 Agent 管理
          </Link>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight text-foreground">
              Agent 自主进化
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              从对话中自动提炼 FAQ 候选，结合知识库进行智能评测，辅助高价值内容入库
            </p>
          </div>
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

            {canManage && batchMode ? (
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
            <TooltipProvider>
              <div
                className={cn(
                  "grid grid-cols-1 gap-4",
                  activeStatus === "filtered" ? "xl:grid-cols-2" : "xl:grid-cols-2",
                )}
              >
                {candidates.map((suggestion, index) => (
                  <SuggestionCard
                    checked={selectedIds.includes(suggestion.id)}
                    displayIndex={(activePage - 1) * PAGE_SIZE + index + 1}
                    key={suggestion.id}
                    onAdopt={() => openIngestDialog("single", [suggestion.id])}
                    onCheckedChange={(checked) => toggleSuggestion(suggestion.id, checked)}
                    onIgnore={() => {
                      setIgnoreTargetIds([suggestion.id]);
                      setIgnoreConfirmationOpen(true);
                    }}
                    onViewSearchDetail={() => setSearchDetailCandidateId(suggestion.id)}
                    selectable={canSelect}
                    showActions={canManage}
                    status={activeStatus}
                    suggestion={suggestion}
                  />
                ))}
              </div>
            </TooltipProvider>
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
          className="max-w-4xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            knowledgeBaseSelectRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>采纳入库</DialogTitle>
            <DialogDescription className="sr-only">
              选择知识库和知识后确认入库
            </DialogDescription>
          </DialogHeader>
          <TooltipProvider>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
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
                      setSelectedKnowledge(null);
                      setKnowledgePickerOpen(false);
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
                  <Label htmlFor="optimization-knowledge-select">
                    选择知识 <span className="text-destructive">*</span>
                  </Label>
                  <Button
                    aria-label="选择知识"
                    className="w-full justify-start px-3 font-normal"
                    disabled={!selectedKnowledgeBase || ingestSubmitting}
                    id="optimization-knowledge-select"
                    onClick={() => setKnowledgePickerOpen(true)}
                    type="button"
                    variant="outline"
                  >
                    <span
                      className={cn(
                        "min-w-0 truncate",
                        selectedKnowledge ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {selectedKnowledge?.nameWithExtension ?? "请选择"}
                    </span>
                  </Button>
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
                        className="min-h-32 resize-none"
                        disabled={ingestSubmitting}
                        id="optimization-answer"
                        onChange={(event) => setIngestAnswer(event.target.value)}
                        value={ingestAnswer}
                      />
                    </div>
                  </>
                ) : null}
              </div>
              <IngestContextPanel
                candidate={ingestPreviewCandidate}
                onViewSearchDetail={
                  ingestPreviewCandidate
                    ? () => setSearchDetailCandidateId(ingestPreviewCandidate.id)
                    : undefined
                }
                selectedCount={ingestTargetIds.length}
              />
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
                !selectedKnowledge ||
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
      <KnowledgePickerDialog
        initialSelection={selectedKnowledge}
        knowledgeBaseId={selectedKnowledgeBaseId}
        onConfirm={(knowledge) => {
          setSelectedKnowledge(knowledge);
          setKnowledgePickerOpen(false);
        }}
        onOpenChange={setKnowledgePickerOpen}
        open={knowledgePickerOpen}
      />
      <SearchDetailDialog
        agentId={agentId}
        candidateId={searchDetailCandidateId}
        onOpenChange={(open) => {
          if (!open) {
            setSearchDetailCandidateId(null);
          }
        }}
        open={searchDetailCandidateId != null}
      />
    </AiHostingLayout>
  );
}

function KnowledgePickerDialog({
  initialSelection,
  knowledgeBaseId,
  onConfirm,
  onOpenChange,
  open,
}: {
  initialSelection: KbDocViewItem | null;
  knowledgeBaseId: string;
  onConfirm: (knowledge: KbDocViewItem) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [records, setRecords] = useState<KbDocViewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const debouncedSearchQuery = useDebouncedValue(searchQuery.trim(), 300);
  const requestVersionRef = useRef(0);
  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: KNOWLEDGE_PICKER_PAGE_SIZE,
    total,
  });

  useEffect(() => {
    if (!open) {
      requestVersionRef.current += 1;
      return;
    }

    setSearchQuery("");
    setCurrentPage(1);
  }, [open]);

  useEffect(() => {
    if (!open || !knowledgeBaseId) {
      return;
    }

    const version = ++requestVersionRef.current;
    setLoading(true);
    setErrorMessage("");

    void listKbDocs(knowledgeBaseId, {
      page: activePage,
      pageSize: KNOWLEDGE_PICKER_PAGE_SIZE,
      query: debouncedSearchQuery || undefined,
    })
      .then((response) => {
        if (version !== requestVersionRef.current) {
          return;
        }

        setRecords(response.docs.map(toKbDocViewItem));
        setTotal(response.pagination.total);
      })
      .catch((error) => {
        if (version !== requestVersionRef.current) {
          return;
        }

        setRecords([]);
        setTotal(0);
        setErrorMessage(isRequestError(error) ? error.message : "加载失败");
      })
      .finally(() => {
        if (version === requestVersionRef.current) {
          setLoading(false);
        }
      });
  }, [activePage, debouncedSearchQuery, knowledgeBaseId, open, refreshVersion]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[min(42rem,calc(100vh-3rem))] max-h-[calc(100vh-3rem)] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>选择知识</DialogTitle>
          <DialogDescription className="sr-only">
            搜索并选择一条已完成的知识
          </DialogDescription>
        </DialogHeader>
        <TooltipProvider>
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex shrink-0 items-center justify-between gap-3">
              <div className="relative w-[280px] max-w-full">
                <HugeiconsIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  icon={Search01Icon}
                  size={17}
                  strokeWidth={1.8}
                />
                <Input
                  aria-label="搜索知识"
                  className="h-10 pl-9"
                  maxLength={KB_SEARCH_QUERY_MAX_LENGTH}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="搜索知识"
                  value={searchQuery}
                />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="添加知识"
                      className="size-8 p-0"
                      onClick={() => {
                        window.open(
                          `/chat/ai-hosting/kb/${knowledgeBaseId}?addKnowledge=qa:new`,
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
                  disabled={loading}
                  label="刷新知识列表"
                  loading={loading}
                  onClick={() => setRefreshVersion((value) => value + 1)}
                />
              </div>
            </div>
            <RadioGroup
              className="min-h-0 flex-1 overflow-hidden [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto"
              onValueChange={(value) => {
                const selected = records.find((record) => record.id === value);
                if (selected) {
                  onConfirm(selected);
                }
              }}
              value={initialSelection?.id ?? ""}
            >
              <Table aria-label="选择知识列表" className="table-fixed">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-10 w-11 px-3">
                      <span className="sr-only">选择</span>
                    </TableHead>
                    <TableHead className="h-10 px-3">知识名称</TableHead>
                    <TableHead className="h-10 w-28 px-3">文件大小</TableHead>
                    <TableHead className="h-10 w-28 px-3">切片数量</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <KbTableLoadingRow colSpan={4} />
                  ) : errorMessage ? (
                    <TableRow>
                      <TableCell className="py-10 text-center text-destructive" colSpan={4}>
                        {errorMessage}
                      </TableCell>
                    </TableRow>
                  ) : records.length === 0 ? (
                    <TableRow>
                      <TableCell className="py-10 text-center text-muted-foreground" colSpan={4}>
                        暂无数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.map((record) => {
                      const disabled = record.status !== "completed";

                      return (
                        <TableRow
                          className={cn(!disabled && "cursor-pointer")}
                          data-state={initialSelection?.id === record.id ? "selected" : undefined}
                          key={record.id}
                          onClick={() => {
                            if (!disabled) {
                              onConfirm(record);
                            }
                          }}
                        >
                          <TableCell className="px-3 py-[11px]">
                            <RadioGroupItem
                              aria-label={`选择 ${record.nameWithExtension}`}
                              disabled={disabled}
                              onClick={(event) => event.stopPropagation()}
                              value={record.id}
                            />
                          </TableCell>
                          <TableCell className="px-3 py-[11px]">
                            <div className="flex min-w-0 items-center gap-2">
                              <FileExtensionBadge
                                className="size-5"
                                extension={record.fileExtension}
                              />
                              <span
                                className={cn(
                                  "min-w-0 truncate",
                                  record.status === "failed" && "text-muted-foreground/65",
                                )}
                              >
                                {record.nameWithExtension}
                              </span>
                              {record.status === "failed" ? (
                                <Badge className="shrink-0 bg-destructive px-2 py-0.5 text-destructive-foreground">
                                  失败
                                </Badge>
                              ) : disabled ? (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {record.status === "queued" ? "排队中" : "解析中"}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-[11px] text-muted-foreground">
                            {record.fileSize}
                          </TableCell>
                          <TableCell className="px-3 py-[11px] text-muted-foreground">
                            {record.sliceCount ?? "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </RadioGroup>
            <TablePagination
              className="shrink-0 border-t-0 py-1"
              onPageChange={setCurrentPage}
              page={activePage}
              total={total}
              totalPages={totalPages}
            />
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}

function IngestContextPanel({
  candidate,
  onViewSearchDetail,
  selectedCount,
}: {
  candidate: AiHostingLearningCandidateItem | null;
  onViewSearchDetail?: () => void;
  selectedCount: number;
}) {
  if (!candidate) {
    return (
      <aside className="border-t pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">批量入库</h3>
          <p className="text-sm text-muted-foreground">已选择 {selectedCount} 条建议</p>
        </div>
      </aside>
    );
  }

  const seatName = candidate.seat?.name ?? "客服";
  const userName = candidate.user?.name ?? "客户";

  return (
    <aside className="border-t pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
      <section aria-labelledby="ingest-evaluation-title">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <HugeiconsIcon
              aria-hidden="true"
              className={candidate.status === "filtered" ? "text-destructive" : "text-success"}
              icon={AiChemistry02Icon}
              size={16}
              strokeWidth={1.8}
            />
            <h3 className="text-sm font-medium text-foreground" id="ingest-evaluation-title">
              AI 评测
            </h3>
          </div>
          <EvaluationMeta confidence={candidate.confidence} status={candidate.status} />
        </div>
        <p className="mt-3 text-sm leading-6 text-foreground">{candidate.rationale}</p>
        <KnowledgeComparison
          className="mt-5"
          layout="ingest"
          onClick={onViewSearchDetail}
          searchResults={candidate.searchResults}
        />
      </section>

      <section aria-labelledby="ingest-source-title" className="mt-8 space-y-3">
        <h3 className="text-sm font-medium text-foreground" id="ingest-source-title">
          来源会话
        </h3>
        <div className="flex items-center justify-between gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="size-7 rounded-full">
                  <AvatarImage alt={seatName} src={candidate.seat?.avatar} />
                  <AvatarFallback className="rounded-full text-xs">
                    {seatName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>{seatName}</TooltipContent>
            </Tooltip>
            <span className="text-xs text-muted-foreground">与</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="size-7 rounded-full">
                  <AvatarImage alt={userName} src={candidate.user?.avatar} />
                  <AvatarFallback className="rounded-full text-xs">
                    {userName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>{userName}</TooltipContent>
            </Tooltip>
          </div>
          {candidate.createdAt ? (
            <time
              className="truncate text-right text-xs text-muted-foreground"
              dateTime={new Date(candidate.createdAt).toISOString()}
            >
              {formatDate(candidate.createdAt)}
            </time>
          ) : null}
        </div>
      </section>
    </aside>
  );
}

function SuggestionCard({
  checked = false,
  displayIndex,
  onAdopt,
  onCheckedChange,
  onIgnore,
  onViewSearchDetail,
  selectable = false,
  showActions = false,
  status,
  suggestion,
}: {
  checked?: boolean;
  displayIndex: number;
  onAdopt?: () => void;
  onCheckedChange?: (checked: boolean) => void;
  onIgnore?: () => void;
  onViewSearchDetail?: () => void;
  selectable?: boolean;
  showActions?: boolean;
  status?: SuggestionStatus;
  suggestion: AiHostingLearningCandidateItem;
}) {
  const seatName = suggestion.seat?.name ?? "客服";
  const userName = suggestion.user?.name ?? "客户";

  return (
    <article className="flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {status === "pending" ? (
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-conversation-active text-sm font-semibold text-conversation-active-foreground shadow-sm">
              {displayIndex}
            </span>
          ) : null}
          <h2 className="truncate text-base font-bold text-foreground">{suggestion.question}</h2>
        </div>
        {selectable ? (
          <Checkbox
            aria-label={`选择建议：${suggestion.question}`}
            checked={checked}
            onCheckedChange={(nextChecked) => onCheckedChange?.(nextChecked === true)}
          />
        ) : null}
      </div>
      <p className="mt-2 h-18 line-clamp-3 text-sm leading-6 text-foreground">
        {suggestion.answer}
      </p>
      <div
        className={cn(
          "mt-3 rounded-[10px] border bg-clip-padding bg-origin-border px-3.5 py-3",
          status === "filtered"
            ? "border-destructive/15 bg-linear-to-r from-background from-55% to-destructive-muted/70"
            : "border-success/15 bg-linear-to-r from-background from-55% to-success-muted/70",
        )}
      >
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <div className="flex min-w-0 items-center gap-1.5 text-foreground">
            <HugeiconsIcon
              aria-hidden="true"
              className={cn(
                "shrink-0",
                status === "filtered" ? "text-destructive" : "text-success",
              )}
              icon={AiChemistry02Icon}
              size={15}
              strokeWidth={1.8}
            />
            <span>AI 评测</span>
          </div>
          <EvaluationMeta confidence={suggestion.confidence} status={status} />
        </div>
        <p className="mt-2 min-h-15 line-clamp-3 text-[13px] leading-5 text-foreground">
          {suggestion.rationale}
        </p>
        <KnowledgeComparison
          className="mt-3"
          layout="card"
          onClick={onViewSearchDetail}
          searchResults={suggestion.searchResults}
        />
      </div>
      <div className="mt-4 flex h-8 shrink-0 items-center justify-between gap-3 pl-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">来源对话</span>
          <div className="flex shrink-0 items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="size-5 rounded-full">
                  <AvatarImage alt={seatName} src={suggestion.seat?.avatar} />
                  <AvatarFallback className="size-5 rounded-full text-[10px]">
                    {seatName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>{seatName}</TooltipContent>
            </Tooltip>
            <span className="text-xs text-muted-foreground">与</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="size-5 rounded-full">
                  <AvatarImage alt={userName} src={suggestion.user?.avatar} />
                  <AvatarFallback className="size-5 rounded-full text-[10px]">
                    {userName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>{userName}</TooltipContent>
            </Tooltip>
          </div>
          {suggestion.createdAt ? (
            <time
              className="truncate text-xs text-muted-foreground"
              dateTime={new Date(suggestion.createdAt).toISOString()}
            >
              {formatDate(suggestion.createdAt)}
            </time>
          ) : null}
        </div>
        {status === "adopted" && hasKnowledgeChunkTarget(suggestion) ? (
          <Button asChild size="sm" variant="outline">
            <Link
              rel="noopener noreferrer"
              target="_blank"
              to={buildKnowledgeChunkPath(suggestion)}
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={Knowledge02Icon}
                size={14}
                strokeWidth={1.8}
              />
              查看知识切片
              <HugeiconsIcon
                aria-hidden="true"
                icon={ArrowRight01Icon}
                size={14}
                strokeWidth={1.8}
              />
            </Link>
          </Button>
        ) : showActions && !selectable && status === "pending" ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              className="border-primary/40 text-primary hover:border-primary/60 hover:bg-primary/5 hover:text-primary"
              onClick={onAdopt}
              size="sm"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={OkFingerIcon}
                size={14}
                strokeWidth={1.8}
              />
              采纳
            </Button>
            <Button
              onClick={onIgnore}
              size="sm"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={UnavailableIcon}
                size={14}
                strokeWidth={1.8}
              />
              忽略
            </Button>
          </div>
        ) : showActions && !selectable && (status === "ignored" || status === "filtered") ? (
          <Button
            className="border-primary/40 text-primary hover:border-primary/60 hover:bg-primary/5 hover:text-primary"
            onClick={onAdopt}
            size="sm"
            type="button"
            variant="outline"
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={OkFingerIcon}
              size={14}
              strokeWidth={1.8}
            />
            采纳
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function EvaluationMeta({
  confidence,
  status,
}: {
  confidence?: number;
  status?: SuggestionStatus;
}) {
  const level = resolveConfidenceLevel(confidence);

  return (
    <div className="ml-auto flex shrink-0 items-center gap-2 text-[13px]">
      {level ? (
        <>
          <span className="font-normal text-muted-foreground">置信度：{level}</span>
          <span aria-hidden="true" className="h-3 w-px bg-border" />
        </>
      ) : null}
      <span
        className={cn(
          "font-medium",
          status === "filtered" ? "text-destructive" : "text-success",
        )}
      >
        {status === "filtered" ? "智能过滤" : "建议入库"}
      </span>
    </div>
  );
}

function resolveConfidenceLevel(confidence?: number) {
  if (confidence == null || !Number.isFinite(confidence)) {
    return undefined;
  }

  if (confidence >= VERY_HIGH_CONFIDENCE_THRESHOLD) {
    return "极高";
  }

  if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    return "高";
  }

  return "中";
}

function KnowledgeComparison({
  className,
  layout,
  onClick,
  searchResults,
}: {
  className?: string;
  layout: "card" | "ingest";
  onClick?: () => void;
  searchResults: AiHostingLearningCandidateItem["searchResults"];
}) {
  if (!searchResults?.length) {
    return null;
  }

  const documents = searchResults.map((result) => (
    <span
      className="flex min-w-0 items-center gap-1.5 rounded-[4px] bg-muted px-2 py-0.5 text-[13px] font-normal text-foreground mix-blend-multiply"
      key={`${result.kbId}:${result.docId}`}
      title={result.docName}
    >
      <FileExtensionBadge className="size-4" extension={result.docSuffix} />
      <span className="min-w-0 truncate">{result.docName}</span>
    </span>
  ));
  const viewButton = (
    <Button
      className="h-auto shrink-0 p-0 text-[13px] font-medium"
      onClick={onClick}
      type="button"
      variant="link"
    >
      查看 &gt;
    </Button>
  );

  if (layout === "ingest") {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-foreground">对比已有知识</h3>
          {viewButton}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">{documents}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap",
        className,
      )}
    >
      <span className="shrink-0 text-[13px] font-medium text-foreground">知识对比</span>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">{documents}</div>
      {viewButton}
    </div>
  );
}

function SearchDetailDialog({
  agentId,
  candidateId,
  onOpenChange,
  open,
}: {
  agentId: string;
  candidateId: string | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [items, setItems] = useState<AiHostingLearningCandidateSearchDetailItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!open || !agentId || !candidateId) {
      return;
    }

    let cancelled = false;
    setItems([]);
    setErrorMessage("");
    setLoading(true);

    void getAgentLearningCandidateSearchDetail(agentId, candidateId)
      .then((response) => {
        if (!cancelled) {
          setItems(response.items);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(isRequestError(error) ? error.message : "加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, candidateId, open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[82vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle className="text-xl">对比已有知识</DialogTitle>
          <DialogDescription className="sr-only">查看候选建议的知识库检索明细</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          {loading ? (
            <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
              <Spinner />
              正在加载
            </div>
          ) : errorMessage ? (
            <div className="flex min-h-56 items-center justify-center text-sm text-destructive">
              {errorMessage}
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">
              暂无数据
            </div>
          ) : (
            <div className="divide-y">
              {items.map((item, index) => (
                <SearchDetailItem item={item} key={`${item.chunkId}:${index}`} rank={index + 1} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SearchDetailItem({
  item,
  rank,
}: {
  item: AiHostingLearningCandidateSearchDetailItem;
  rank: number;
}) {
  return (
    <article className="py-4">
      {item.chunkTitle ? (
        <h3 className="text-base font-semibold leading-6 text-foreground">{item.chunkTitle}</h3>
      ) : null}
      <p className={cn("whitespace-pre-wrap text-sm leading-6 text-foreground", item.chunkTitle && "mt-1")}>
        {item.content || "-"}
      </p>
      <div className="mt-3 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <FileExtensionBadge className="size-4" extension={item.docSuffix} />
        <span className="truncate">{item.kbName || "知识库"}</span>
        <span aria-hidden="true">/</span>
        <span className="truncate">{item.docName || "知识文档"}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">召回分数</span>
          <span className="font-medium text-primary">{formatRecallScore(item.score)}</span>
          <Badge className="rounded-[6px] px-2 py-1 font-semibold" variant="secondary">
            NO.{rank}
          </Badge>
        </div>
        <Button asChild className="h-7 shrink-0 px-2 text-[13px] font-medium" variant="secondary">
          <Link
            rel="noopener noreferrer"
            target="_blank"
            to={buildSearchDetailTargetPath(item)}
          >
            查看切片
          </Link>
        </Button>
      </div>
    </article>
  );
}

function formatRecallScore(score: number) {
  return score.toFixed(4).replace(/0+$/u, "").replace(/\.$/u, "");
}

function hasKnowledgeChunkTarget(
  suggestion: AiHostingLearningCandidateItem,
): suggestion is AiHostingLearningCandidateItem & {
  targetDocId: string;
  targetEntryId: string;
  targetKbId: string;
} {
  return Boolean(suggestion.targetKbId && suggestion.targetDocId && suggestion.targetEntryId);
}

function buildKnowledgeChunkPath(
  suggestion: AiHostingLearningCandidateItem & {
    targetDocId: string;
    targetEntryId: string;
    targetKbId: string;
  },
) {
  const searchParams = new URLSearchParams({ entryId: suggestion.targetEntryId });

  return `/chat/ai-hosting/kb/${encodeURIComponent(suggestion.targetKbId)}/docs/${encodeURIComponent(suggestion.targetDocId)}?${searchParams.toString()}`;
}

function buildKnowledgeChunkPathFromIds(kbId: string, docId: string, chunkId: string) {
  const searchParams = new URLSearchParams({ chunkId });

  return `/chat/ai-hosting/kb/${encodeURIComponent(kbId)}/docs/${encodeURIComponent(docId)}?${searchParams.toString()}`;
}

function buildSearchDetailTargetPath(item: AiHostingLearningCandidateSearchDetailItem) {
  const chunkId = resolveVolcChunkDisplayId(item.volcChunkId);

  if (item.docType === 4) {
    const searchParams = new URLSearchParams({
      chunkId,
      docId: item.docId,
      tab: "attachments",
    });

    return `/chat/ai-hosting/kb/${encodeURIComponent(item.kbId)}?${searchParams.toString()}`;
  }

  return buildKnowledgeChunkPathFromIds(item.kbId, item.docId, chunkId);
}

function resolveVolcChunkDisplayId(volcChunkId: string) {
  return volcChunkId.split("_").pop()?.trim() || volcChunkId;
}

function formatDate(value: number) {
  const date = new Date(value);
  const pad = (input: number) => String(input).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
