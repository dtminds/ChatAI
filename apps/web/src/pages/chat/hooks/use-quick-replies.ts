import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  QUICK_REPLY_SCOPE_TYPE,
  type QuickReplyScopeType,
  type WorkbenchQuickReplyAttachment,
  type WorkbenchQuickReplyCategoryDto,
  type WorkbenchQuickReplyCreateRequest,
  type WorkbenchQuickReplyDto,
  type WorkbenchQuickReplyUpdateRequest,
} from "@chatai/contracts";
import { toast } from "sonner";
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";
import {
  buildQuickReplyBatchItems,
  buildQuickReplyCategoryEnsureRequest,
  chunkQuickReplyImportItems,
  type QuickReplyImportParsedRow,
} from "@/pages/chat/components/quick-reply/quick-reply-import";

export type QuickReplyFormValues = {
  attachments: WorkbenchQuickReplyAttachment[];
  categoryId: string | 0;
  contentText: string;
  labelColor: string;
  labelText: string;
};

export function useQuickReplies(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [activeScopeType, setActiveScopeTypeState] = useState<QuickReplyScopeType>(
    QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
  );
  const [activeCategoryId, setActiveCategoryIdState] = useState<string | 0 | null>(
    null,
  );
  const [activeTopCategoryId, setActiveTopCategoryIdState] = useState<string | null>(
    null,
  );
  const [keywordInput, setKeywordInput] = useState("");
  const [categories, setCategories] = useState<WorkbenchQuickReplyCategoryDto[]>([]);
  const [quickReplies, setQuickReplies] = useState<WorkbenchQuickReplyDto[]>([]);
  const [quickRepliesByCategoryId, setQuickRepliesByCategoryId] = useState<
    Record<string, WorkbenchQuickReplyDto[]>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const requestSeqRef = useRef(0);
  const activeCategoryIdRef = useRef<string | 0 | null>(null);
  const activeTopCategoryIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeCategoryIdRef.current = activeCategoryId;
  }, [activeCategoryId]);
  useEffect(() => {
    activeTopCategoryIdRef.current = activeTopCategoryId;
  }, [activeTopCategoryId]);

  const loadQuickReplies = useCallback(async (topCategoryId?: string | null) => {
    if (!enabled) {
      return;
    }

    const requestedTopCategoryId =
      topCategoryId === undefined ? activeTopCategoryIdRef.current : topCategoryId;
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    setIsLoading(true);

    try {
      const categoryResponse = await getWorkbenchService().listQuickReplyCategories({
        scopeType: activeScopeType,
      });
      const topCategories = categoryResponse.categories.filter(
        (category) => category.parentId === 0,
      );
      const resolvedTopCategory =
        topCategories.find((category) => category.id === requestedTopCategoryId) ??
        topCategories[0] ??
        null;
      const contentResponse = resolvedTopCategory
        ? await getWorkbenchService().listQuickReplyCategoryContent({
            parentCategoryId: resolvedTopCategory.id,
            scopeType: activeScopeType,
          })
        : null;

      if (requestSeqRef.current !== requestSeq) {
        return;
      }

      if (resolvedTopCategory?.id !== activeTopCategoryIdRef.current) {
        setActiveTopCategoryIdState(resolvedTopCategory?.id ?? null);
        activeTopCategoryIdRef.current = resolvedTopCategory?.id ?? null;
      }
      setCategories([
        ...topCategories,
        ...(contentResponse?.categories ?? []),
      ]);
      setQuickReplies(
        Object.values(contentResponse?.quickRepliesByCategoryId ?? {}).flat(),
      );
      setQuickRepliesByCategoryId(contentResponse?.quickRepliesByCategoryId ?? {});
    } catch {
      if (requestSeqRef.current === requestSeq) {
        toast.warning("快捷话术加载失败");
      }
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setIsLoading(false);
      }
    }
  }, [activeScopeType, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void loadQuickReplies();
  }, [enabled, loadQuickReplies]);

  const runMutation = useCallback(
    async (mutation: () => Promise<void>, successMessage?: string) => {
      setIsMutating(true);

      try {
        await mutation();
        if (successMessage) {
          toast.success(successMessage);
        }
        await loadQuickReplies();
      } catch (error) {
        toast.warning(getErrorMessage(error));
        throw error;
      } finally {
        setIsMutating(false);
      }
    },
    [loadQuickReplies],
  );

  const createCategory = useCallback(
    (input: { parentId: string | 0; title: string }) =>
      runMutation(
        async () => {
          await getWorkbenchService().createQuickReplyCategory({
            parentId: input.parentId,
            scopeType: activeScopeType,
            title: input.title,
          });
        },
        "分类已保存",
      ),
    [activeScopeType, runMutation],
  );

  const updateCategory = useCallback(
    (categoryId: string, title: string, scopeType = activeScopeType) =>
      runMutation(
        async () => {
          await getWorkbenchService().renameQuickReplyCategory(
            categoryId,
            scopeType,
            { title },
          );
        },
        "分类已保存",
      ),
    [activeScopeType, runMutation],
  );

  const topCategory = useCallback(
    (category: WorkbenchQuickReplyCategoryDto) =>
      runMutation(async () => {
        await getWorkbenchService().topQuickReplyCategory(
          category.id,
          category.scopeType,
        );
      }),
    [runMutation],
  );

  const bottomCategory = useCallback(
    (category: WorkbenchQuickReplyCategoryDto) =>
      runMutation(async () => {
        await getWorkbenchService().bottomQuickReplyCategory(
          category.id,
          category.scopeType,
        );
      }),
    [runMutation],
  );

  const moveCategory = useCallback(
    (category: WorkbenchQuickReplyCategoryDto, parentId: string) =>
      runMutation(async () => {
        await getWorkbenchService().moveQuickReplyCategory(
          category.id,
          category.scopeType,
          { parentId },
        );
      }),
    [runMutation],
  );

  const deleteCategory = useCallback(
    (category: WorkbenchQuickReplyCategoryDto) =>
      runMutation(
        async () => {
          await getWorkbenchService().deleteQuickReplyCategory(
            category.id,
            category.scopeType,
          );

          if (activeCategoryIdRef.current === category.id) {
            setActiveCategoryIdState(null);
          }
          if (activeTopCategoryIdRef.current === category.id) {
            setActiveTopCategoryIdState(null);
          }
        },
        "分类已删除",
      ),
    [runMutation],
  );

  const createQuickReply = useCallback(
    (values: QuickReplyFormValues) =>
      runMutation(
        async () => {
          await getWorkbenchService().createQuickReply(
            buildQuickReplyRequest(activeScopeType, values),
          );
        },
        "话术已保存",
      ),
    [activeScopeType, runMutation],
  );

  const updateQuickReply = useCallback(
    (
      quickReplyId: string,
      values: QuickReplyFormValues,
      scopeType = activeScopeType,
    ) =>
      runMutation(
        async () => {
          await getWorkbenchService().updateQuickReply(
            quickReplyId,
            buildQuickReplyRequest(scopeType, values),
          );
        },
        "话术已保存",
      ),
    [activeScopeType, runMutation],
  );

  const topQuickReply = useCallback(
    (quickReply: WorkbenchQuickReplyDto) =>
      runMutation(async () => {
        await getWorkbenchService().topQuickReply(
          quickReply.id,
          quickReply.scopeType,
        );
      }),
    [runMutation],
  );

  const bottomQuickReply = useCallback(
    (quickReply: WorkbenchQuickReplyDto) =>
      runMutation(async () => {
        await getWorkbenchService().bottomQuickReply(
          quickReply.id,
          quickReply.scopeType,
        );
      }),
    [runMutation],
  );

  const moveQuickReply = useCallback(
    (quickReply: WorkbenchQuickReplyDto, categoryId: string) =>
      runMutation(async () => {
        await getWorkbenchService().moveQuickReply(
          quickReply.id,
          quickReply.scopeType,
          { categoryId },
        );
      }),
    [runMutation],
  );

  const deleteQuickReply = useCallback(
    (quickReply: WorkbenchQuickReplyDto) =>
      runMutation(
        async () => {
          await getWorkbenchService().deleteQuickReply(
            quickReply.id,
            quickReply.scopeType,
          );
        },
        "话术已删除",
      ),
    [runMutation],
  );

  const importQuickReplies = useCallback(
    async (
      rows: QuickReplyImportParsedRow[],
      onProgress?: (input: {
        importedCount: number;
        progress: number;
        totalCount: number;
      }) => void,
    ) => {
      setIsMutating(true);

      try {
        const ensureResponse =
          await getWorkbenchService().ensureQuickReplyCategories(
            buildQuickReplyCategoryEnsureRequest(activeScopeType, rows),
          );

        if (!ensureResponse.ok) {
          return {
            errorMsg: ensureResponse.errorMsg,
            errors: ensureResponse.errors ?? [],
            importedCount: 0,
            ok: false as const,
          };
        }

        const items = buildQuickReplyBatchItems(rows, ensureResponse);
        const chunks = chunkQuickReplyImportItems(items);
        let importedCount = 0;

        onProgress?.({
          importedCount,
          progress: 10,
          totalCount: items.length,
        });

        for (const chunk of chunks) {
          const response = await getWorkbenchService().batchCreateQuickReplies({
            items: chunk,
            scopeType: activeScopeType,
          });

          if (!response.ok) {
            await loadQuickReplies();
            return {
              errorMsg: response.errorMsg,
              errors: response.errors ?? [],
              importedCount,
              ok: false as const,
            };
          }

          importedCount += response.summary.createdQuickReplyCount;
          onProgress?.({
            importedCount,
            progress: 10 + Math.floor((importedCount / items.length) * 90),
            totalCount: items.length,
          });
        }

        await loadQuickReplies();
        return { importedCount, ok: true as const };
      } catch {
        return {
          errorMsg: "网络异常，请重试",
          errors: [],
          importedCount: 0,
          ok: false as const,
        };
      } finally {
        setIsMutating(false);
      }
    },
    [activeScopeType, loadQuickReplies],
  );

  const setActiveScopeType = useCallback((scopeType: QuickReplyScopeType) => {
    setActiveScopeTypeState(scopeType);
    setActiveCategoryIdState(null);
    setActiveTopCategoryIdState(null);
    setKeywordInput("");
    setCategories([]);
    setIsLoading(true);
    setQuickReplies([]);
    setQuickRepliesByCategoryId({});
  }, []);
  const setActiveTopCategoryId = useCallback((categoryId: string | null) => {
    setActiveTopCategoryIdState(categoryId);
    activeTopCategoryIdRef.current = categoryId;
    setActiveCategoryIdState(null);
    void loadQuickReplies(categoryId);
  }, [loadQuickReplies]);

  return useMemo(
    () => ({
      activeCategoryId,
      activeScopeType,
      activeTopCategoryId,
      bottomCategory,
      bottomQuickReply,
      categories,
      createCategory,
      createQuickReply,
      deleteCategory,
      deleteQuickReply,
      isLoading,
      isMutating,
      importQuickReplies,
      keyword: keywordInput,
      moveCategory,
      moveQuickReply,
      quickReplies,
      quickRepliesByCategoryId,
      reload: loadQuickReplies,
      setActiveCategoryId: setActiveCategoryIdState,
      setActiveScopeType,
      setActiveTopCategoryId,
      setKeyword: setKeywordInput,
      topCategory,
      topQuickReply,
      updateCategory,
      updateQuickReply,
    }),
    [
      activeCategoryId,
      activeScopeType,
      activeTopCategoryId,
      bottomCategory,
      bottomQuickReply,
      categories,
      createCategory,
      createQuickReply,
      deleteCategory,
      deleteQuickReply,
      isLoading,
      isMutating,
      importQuickReplies,
      keywordInput,
      loadQuickReplies,
      moveCategory,
      moveQuickReply,
      quickReplies,
      quickRepliesByCategoryId,
      setActiveScopeType,
      setActiveTopCategoryId,
      topCategory,
      topQuickReply,
      updateCategory,
      updateQuickReply,
    ],
  );
}

function buildQuickReplyRequest(
  scopeType: QuickReplyScopeType,
  values: QuickReplyFormValues,
): WorkbenchQuickReplyCreateRequest | WorkbenchQuickReplyUpdateRequest {
  return {
    attachments: values.attachments,
    categoryId: values.categoryId,
    contentText: values.contentText,
    labelColor: values.labelColor,
    labelText: values.labelText,
    scopeType,
  };
}

function getErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "操作失败";
}
