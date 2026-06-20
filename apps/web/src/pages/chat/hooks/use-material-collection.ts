import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  readMaterialDescription,
  readMaterialLinkUrl,
  validateMaterialCollectionSubmitFields,
  type MaterialCollectionBizType,
  type WorkbenchMaterialCollectionGroupDto,
  type WorkbenchMaterialCollectionItemDto,
} from "@chatai/contracts";
import { getWorkbenchService } from "@/pages/chat/api/workbench-service";
import type { ChatMessage } from "@/pages/chat/chat-types";
import type { MaterialCollectSubmitPayload } from "@/pages/chat/components/material-collection/material-group-select-dialog";
import type { MaterialContentFormValues } from "@/pages/chat/components/material-collection/material-content-form-fields";
import { resolveMaterialFileExtension } from "@/pages/chat/components/material-collection/material-file-name";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";
import { getFileExtension } from "@/pages/chat/lib/composer-file-files";

export type ComposerMaterialBizType =
  | typeof MATERIAL_COLLECTION_BIZ_TYPE.FILE
  | typeof MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM
  | typeof MATERIAL_COLLECTION_BIZ_TYPE.H5
  | typeof MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED;

type SendMaterialResult =
  | {
      ok: true;
    }
  | {
      errorCode: string;
      errorMessage?: string;
      reason: "file-upload" | "image-upload" | "send" | "unavailable";
      ok: false;
    };

type PendingMaterialCollection = {
  bizType: ComposerMaterialBizType;
  conversationId: string;
  formValues: MaterialContentFormValues;
  msgInfoId: string;
};

type MaterialLibraryMutationRefresh =
  | "items"
  | "groups"
  | "groups-and-items-if-active-removed";

type UseMaterialCollectionOptions = {
  bootstrapStatus: "idle" | "loading" | "ready" | "error";
  isMountedRef: RefObject<boolean>;
  onSendFailure: (failure: {
    errorCode: string;
    errorMessage?: string;
    reason: "file-upload" | "image-upload" | "send" | "unavailable";
  }) => void;
  onSent: () => void;
  requestActiveConversationRead: () => Promise<void> | void;
  resolvedActiveConversationId?: string;
  sendAgentMessageSegments: (
    segments: ComposerSegment[],
  ) => Promise<SendMaterialResult>;
};

export function useMaterialCollection({
  bootstrapStatus,
  isMountedRef,
  onSendFailure,
  onSent,
  requestActiveConversationRead,
  resolvedActiveConversationId,
  sendAgentMessageSegments,
}: UseMaterialCollectionOptions) {
  const [pendingMaterialCollection, setPendingMaterialCollection] =
    useState<PendingMaterialCollection | null>(null);
  const [materialCollectionGroups, setMaterialCollectionGroups] = useState<
    WorkbenchMaterialCollectionGroupDto[]
  >([]);
  const [isCollectingMaterial, setIsCollectingMaterial] = useState(false);
  const [collectedExpressions, setCollectedExpressions] = useState<
    WorkbenchMaterialCollectionItemDto[]
  >([]);
  const [collectedExpressionPage, setCollectedExpressionPage] = useState(1);
  const [hasMoreCollectedExpressions, setHasMoreCollectedExpressions] =
    useState(false);
  const [isCollectedExpressionLoadingMore, setIsCollectedExpressionLoadingMore] =
    useState(false);
  const [activeMaterialLibraryBizType, setActiveMaterialLibraryBizType] =
    useState<ComposerMaterialBizType | null>(null);
  const [materialLibraryGroups, setMaterialLibraryGroups] = useState<
    WorkbenchMaterialCollectionGroupDto[]
  >([]);
  const [materialLibraryItems, setMaterialLibraryItems] = useState<
    WorkbenchMaterialCollectionItemDto[]
  >([]);
  const [activeMaterialLibraryGroupId, setActiveMaterialLibraryGroupId] =
    useState<string | null>(null);
  const [materialLibraryPage, setMaterialLibraryPage] = useState(1);
  const [hasMoreMaterialLibraryItems, setHasMoreMaterialLibraryItems] =
    useState(false);
  const [isMaterialLibraryBusy, setIsMaterialLibraryBusy] = useState(false);
  const [isMaterialLibrarySending, setIsMaterialLibrarySending] = useState(false);
  const [sendingMaterialId, setSendingMaterialId] = useState<string | null>(null);
  const [isMaterialLibraryGroupsLoading, setIsMaterialLibraryGroupsLoading] =
    useState(false);
  const [isMaterialLibraryItemsLoading, setIsMaterialLibraryItemsLoading] =
    useState(false);
  const [isMaterialLibraryLoadingMore, setIsMaterialLibraryLoadingMore] =
    useState(false);

  const materialLibraryRequestSeqRef = useRef(0);
  const activeMaterialLibraryBizTypeRef =
    useRef<ComposerMaterialBizType | null>(null);
  const activeMaterialLibraryGroupIdRef = useRef<string | null>(null);
  const resolvedActiveConversationIdRef = useRef<string | undefined>(
    resolvedActiveConversationId,
  );

  activeMaterialLibraryBizTypeRef.current = activeMaterialLibraryBizType;
  activeMaterialLibraryGroupIdRef.current = activeMaterialLibraryGroupId;
  resolvedActiveConversationIdRef.current = resolvedActiveConversationId;

  const refreshCollectedExpressions = useCallback(async () => {
    try {
      const response = await getWorkbenchService().listMaterialCollections({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
        groupId: 0,
        page: 1,
        pageSize: 100,
      });

      if (isMountedRef.current) {
        setCollectedExpressions(response.items);
        setCollectedExpressionPage(response.pagination.page);
        setHasMoreCollectedExpressions(response.pagination.hasMore);
      }
    } catch (error) {
      if (isMountedRef.current) {
        toast.warning(getMaterialErrorMessage(error, "收藏表情加载失败"));
      }
    }
  }, [isMountedRef]);

  const handleLoadMoreCollectedExpressions = useCallback(async () => {
    if (isCollectedExpressionLoadingMore || !hasMoreCollectedExpressions) {
      return;
    }

    const nextPage = collectedExpressionPage + 1;

    setIsCollectedExpressionLoadingMore(true);

    try {
      const response = await getWorkbenchService().listMaterialCollections({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
        groupId: 0,
        page: nextPage,
        pageSize: 100,
      });

      if (!isMountedRef.current) {
        return;
      }

      setCollectedExpressions((currentItems) => [
        ...currentItems,
        ...response.items,
      ]);
      setCollectedExpressionPage(response.pagination.page);
      setHasMoreCollectedExpressions(response.pagination.hasMore);
    } catch (error) {
      if (isMountedRef.current) {
        toast.warning(getMaterialErrorMessage(error, "收藏表情加载失败"));
      }
    } finally {
      if (isMountedRef.current) {
        setIsCollectedExpressionLoadingMore(false);
      }
    }
  }, [
    collectedExpressionPage,
    hasMoreCollectedExpressions,
    isCollectedExpressionLoadingMore,
    isMountedRef,
  ]);

  const loadMaterialLibraryItems = useCallback(
    async ({
      bizType,
      groupId,
      mode,
      page,
      requestSeq,
    }: {
      bizType: ComposerMaterialBizType;
      groupId: string;
      mode: "append" | "replace";
      page: number;
      requestSeq: number;
    }) => {
      const response = await getWorkbenchService().listMaterialCollections({
        bizType,
        groupId,
        page,
        pageSize: 100,
      });

      if (
        !isMountedRef.current ||
        materialLibraryRequestSeqRef.current !== requestSeq
      ) {
        return;
      }

      if (mode === "append") {
        setMaterialLibraryItems((currentItems) => [
          ...currentItems,
          ...response.items,
        ]);
      } else {
        setMaterialLibraryItems(response.items);
      }
      setMaterialLibraryPage(response.pagination.page);
      setHasMoreMaterialLibraryItems(response.pagination.hasMore);
    },
    [isMountedRef],
  );

  const loadMaterialLibrary = useCallback(
    async (bizType: ComposerMaterialBizType) => {
      const requestSeq = materialLibraryRequestSeqRef.current + 1;

      materialLibraryRequestSeqRef.current = requestSeq;
      setIsMaterialLibraryBusy(true);
      setIsMaterialLibraryGroupsLoading(true);
      setIsMaterialLibraryItemsLoading(false);
      setIsMaterialLibraryLoadingMore(false);
      setActiveMaterialLibraryGroupId(null);
      setMaterialLibraryGroups([]);
      setMaterialLibraryItems([]);
      setMaterialLibraryPage(1);
      setHasMoreMaterialLibraryItems(false);

      try {
        const groupsResponse = await getWorkbenchService().listMaterialGroups({
          bizType,
        });

        if (
          !isMountedRef.current ||
          materialLibraryRequestSeqRef.current !== requestSeq
        ) {
          return;
        }

        setMaterialLibraryGroups(groupsResponse.groups);
        const firstGroupId = groupsResponse.groups[0]?.id ?? null;

        setActiveMaterialLibraryGroupId(firstGroupId);
        setIsMaterialLibraryGroupsLoading(false);

        if (!firstGroupId) {
          setMaterialLibraryItems([]);
          return;
        }

        setIsMaterialLibraryItemsLoading(true);
        await loadMaterialLibraryItems({
          bizType,
          groupId: firstGroupId,
          mode: "replace",
          page: 1,
          requestSeq,
        });
      } catch (error) {
        if (
          isMountedRef.current &&
          materialLibraryRequestSeqRef.current === requestSeq
        ) {
          toast.warning(getMaterialErrorMessage(error, "素材加载失败"));
        }
      } finally {
        if (
          isMountedRef.current &&
          materialLibraryRequestSeqRef.current === requestSeq
        ) {
          setIsMaterialLibraryBusy(false);
          setIsMaterialLibraryGroupsLoading(false);
          setIsMaterialLibraryItemsLoading(false);
          setIsMaterialLibraryLoadingMore(false);
        }
      }
    },
    [isMountedRef, loadMaterialLibraryItems],
  );

  const reloadActiveMaterialLibraryItems = useCallback(
    async (bizType: ComposerMaterialBizType) => {
      if (activeMaterialLibraryBizTypeRef.current !== bizType) {
        return;
      }

      const groupId = activeMaterialLibraryGroupIdRef.current;

      if (!groupId) {
        return;
      }

      const requestSeq = materialLibraryRequestSeqRef.current + 1;

      materialLibraryRequestSeqRef.current = requestSeq;
      setIsMaterialLibraryBusy(true);
      setIsMaterialLibraryItemsLoading(true);
      setIsMaterialLibraryLoadingMore(false);
      setMaterialLibraryItems([]);
      setMaterialLibraryPage(1);
      setHasMoreMaterialLibraryItems(false);

      try {
        await loadMaterialLibraryItems({
          bizType,
          groupId,
          mode: "replace",
          page: 1,
          requestSeq,
        });
      } catch (error) {
        if (
          isMountedRef.current &&
          materialLibraryRequestSeqRef.current === requestSeq
        ) {
          toast.warning(getMaterialErrorMessage(error, "素材加载失败"));
        }
      } finally {
        if (
          isMountedRef.current &&
          materialLibraryRequestSeqRef.current === requestSeq
        ) {
          setIsMaterialLibraryBusy(false);
          setIsMaterialLibraryItemsLoading(false);
          setIsMaterialLibraryLoadingMore(false);
        }
      }
    },
    [isMountedRef, loadMaterialLibraryItems],
  );

  const reloadMaterialLibraryGroups = useCallback(
    async (
      bizType: ComposerMaterialBizType,
      options?: { reloadItemsIfActiveGroupRemoved?: boolean },
    ) => {
      const requestSeq = materialLibraryRequestSeqRef.current + 1;

      materialLibraryRequestSeqRef.current = requestSeq;
      setIsMaterialLibraryBusy(true);
      setIsMaterialLibraryGroupsLoading(true);

      try {
        const groupsResponse = await getWorkbenchService().listMaterialGroups({
          bizType,
        });

        if (
          !isMountedRef.current ||
          materialLibraryRequestSeqRef.current !== requestSeq
        ) {
          return;
        }

        const currentGroupId = activeMaterialLibraryGroupIdRef.current;
        const activeGroupStillExists = currentGroupId
          ? groupsResponse.groups.some((group) => group.id === currentGroupId)
          : false;
        const nextGroupId =
          groupsResponse.groups.find((group) => group.id === currentGroupId)?.id ??
          groupsResponse.groups[0]?.id ??
          null;

        setMaterialLibraryGroups(groupsResponse.groups);

        const shouldReloadItemsBecauseActiveGroupRemoved =
          options?.reloadItemsIfActiveGroupRemoved &&
          currentGroupId !== null &&
          !activeGroupStillExists;
        const shouldActivateInitialGroup =
          currentGroupId === null && nextGroupId !== null;

        if (
          shouldReloadItemsBecauseActiveGroupRemoved ||
          shouldActivateInitialGroup
        ) {
          setActiveMaterialLibraryGroupId(nextGroupId);
          setMaterialLibraryItems([]);
          setMaterialLibraryPage(1);
          setHasMoreMaterialLibraryItems(false);

          if (nextGroupId) {
            setIsMaterialLibraryItemsLoading(true);
            await loadMaterialLibraryItems({
              bizType,
              groupId: nextGroupId,
              mode: "replace",
              page: 1,
              requestSeq,
            });
          }
        }
      } catch (error) {
        if (
          isMountedRef.current &&
          materialLibraryRequestSeqRef.current === requestSeq
        ) {
          toast.warning(getMaterialErrorMessage(error, "素材加载失败"));
        }
      } finally {
        if (
          isMountedRef.current &&
          materialLibraryRequestSeqRef.current === requestSeq
        ) {
          setIsMaterialLibraryBusy(false);
          setIsMaterialLibraryGroupsLoading(false);
          setIsMaterialLibraryItemsLoading(false);
          setIsMaterialLibraryLoadingMore(false);
        }
      }
    },
    [isMountedRef, loadMaterialLibraryItems],
  );

  const refreshMaterialList = useCallback(
    async (
      bizType: MaterialCollectionBizType,
      options?: { groupId?: string },
    ) => {
      if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION) {
        await refreshCollectedExpressions();
        return;
      }

      if (activeMaterialLibraryBizTypeRef.current !== bizType) {
        return;
      }

      const targetGroupId = options?.groupId;

      if (
        targetGroupId &&
        targetGroupId !== activeMaterialLibraryGroupIdRef.current
      ) {
        return;
      }

      await reloadActiveMaterialLibraryItems(
        bizType as ComposerMaterialBizType,
      );
    },
    [refreshCollectedExpressions, reloadActiveMaterialLibraryItems],
  );

  const handleOpenCollectedExpressions = useCallback(() => {
    if (bootstrapStatus !== "ready") {
      return;
    }

    void refreshCollectedExpressions();
  }, [bootstrapStatus, refreshCollectedExpressions]);

  const handleCollectMaterial = useCallback(
    async (message: ChatMessage) => {
      const bizType = getMaterialBizTypeForMessage(message);

      if (!bizType) {
        return;
      }

      const msgInfoId = readCollectMessageInfoId(message);

      if (!msgInfoId) {
        toast.warning("收录失败，请稍后重试");
        return;
      }

      if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION) {
        setIsCollectingMaterial(true);

        try {
          const response = await getWorkbenchService().collectMaterial({
            bizType,
            groupId: 0,
            msgInfoId,
          });

          if (!isMountedRef.current) {
            return;
          }

          if (!response.success) {
            toast.warning(response.errorMsg || "收录失败，请稍后重试");
            return;
          }

          toast.success("已收录");
          void refreshMaterialList(bizType);
        } catch (error) {
          if (isMountedRef.current) {
            toast.warning(getMaterialErrorMessage(error, "收录失败，请稍后重试"));
          }
        } finally {
          if (isMountedRef.current) {
            setIsCollectingMaterial(false);
          }
        }
        return;
      }

      setIsCollectingMaterial(true);

      try {
        const response = await getWorkbenchService().listMaterialGroups({
          bizType,
        });

        if (!isMountedRef.current) {
          return;
        }

        if (message.conversationId !== resolvedActiveConversationIdRef.current) {
          return;
        }

        setMaterialCollectionGroups(response.groups);
        setPendingMaterialCollection({
          bizType,
          conversationId: message.conversationId,
          formValues: getCollectFormValuesFromMessage(message),
          msgInfoId,
        });
      } catch (error) {
        if (isMountedRef.current) {
          toast.warning(getMaterialErrorMessage(error, "分组加载失败"));
        }
      } finally {
        if (isMountedRef.current) {
          setIsCollectingMaterial(false);
        }
      }
    },
    [isMountedRef, refreshMaterialList],
  );

  const handleSubmitMaterialCollection = useCallback(
    async (payload: MaterialCollectSubmitPayload) => {
      if (!pendingMaterialCollection) {
        return;
      }

      if (
        pendingMaterialCollection.conversationId !== resolvedActiveConversationIdRef.current
      ) {
        setPendingMaterialCollection(null);
        setMaterialCollectionGroups([]);
        return;
      }

      setIsCollectingMaterial(true);

      try {
        const response = await getWorkbenchService().collectMaterial({
          bizType: pendingMaterialCollection.bizType,
          description: payload.description,
          fileName: payload.fileName,
          groupId: payload.groupId,
          msgInfoId: pendingMaterialCollection.msgInfoId,
          title: payload.title,
        });

        if (!isMountedRef.current) {
          return;
        }

        if (!response.success) {
          toast.warning(response.errorMsg || "收录失败，请稍后重试");
          return;
        }

        toast.success("已收录");
        setPendingMaterialCollection(null);
        void refreshMaterialList(pendingMaterialCollection.bizType, {
          groupId: payload.groupId,
        });
      } catch (error) {
        if (isMountedRef.current) {
          toast.warning(getMaterialErrorMessage(error, "收录失败，请稍后重试"));
        }
      } finally {
        if (isMountedRef.current) {
          setIsCollectingMaterial(false);
        }
      }
    },
    [isMountedRef, pendingMaterialCollection, refreshMaterialList],
  );

  const handleCreatePendingMaterialGroup = useCallback(
    async (title: string) => {
      if (!pendingMaterialCollection) {
        return undefined;
      }

      if (
        pendingMaterialCollection.conversationId !== resolvedActiveConversationIdRef.current
      ) {
        setPendingMaterialCollection(null);
        setMaterialCollectionGroups([]);
        return undefined;
      }

      setIsCollectingMaterial(true);

      try {
        const group = await getWorkbenchService().createMaterialGroup({
          bizType: pendingMaterialCollection.bizType,
          title,
        });

        if (!isMountedRef.current) {
          return undefined;
        }

        setMaterialCollectionGroups((currentGroups) => [
          group,
          ...currentGroups.filter((currentGroup) => currentGroup.id !== group.id),
        ]);
        return group;
      } catch (error) {
        if (isMountedRef.current) {
          toast.warning(getMaterialErrorMessage(error, "新建分组失败"));
        }
        return undefined;
      } finally {
        if (isMountedRef.current) {
          setIsCollectingMaterial(false);
        }
      }
    },
    [isMountedRef, pendingMaterialCollection],
  );

  const handleOpenMaterialLibrary = useCallback(
    (bizType: ComposerMaterialBizType) => {
      setActiveMaterialLibraryBizType(bizType);
      setMaterialLibraryGroups([]);
      setMaterialLibraryItems([]);
      void loadMaterialLibrary(bizType);
    },
    [loadMaterialLibrary],
  );

  const handleSelectMaterialLibraryGroup = useCallback(
    async (groupId: string) => {
      if (!activeMaterialLibraryBizType) {
        return;
      }

      const requestSeq = materialLibraryRequestSeqRef.current + 1;

      materialLibraryRequestSeqRef.current = requestSeq;
      setActiveMaterialLibraryGroupId(groupId);
      setMaterialLibraryItems([]);
      setMaterialLibraryPage(1);
      setHasMoreMaterialLibraryItems(false);
      setIsMaterialLibraryBusy(true);
      setIsMaterialLibraryItemsLoading(true);
      setIsMaterialLibraryLoadingMore(false);

      try {
        await loadMaterialLibraryItems({
          bizType: activeMaterialLibraryBizType,
          groupId,
          mode: "replace",
          page: 1,
          requestSeq,
        });
      } catch (error) {
        if (
          isMountedRef.current &&
          materialLibraryRequestSeqRef.current === requestSeq
        ) {
          toast.warning(getMaterialErrorMessage(error, "素材加载失败"));
        }
      } finally {
        if (
          isMountedRef.current &&
          materialLibraryRequestSeqRef.current === requestSeq
        ) {
          setIsMaterialLibraryBusy(false);
          setIsMaterialLibraryItemsLoading(false);
        }
      }
    },
    [activeMaterialLibraryBizType, isMountedRef, loadMaterialLibraryItems],
  );

  const handleLoadMoreMaterialLibraryItems = useCallback(async () => {
    if (
      !activeMaterialLibraryBizType ||
      !activeMaterialLibraryGroupId ||
      isMaterialLibraryLoadingMore ||
      !hasMoreMaterialLibraryItems
    ) {
      return;
    }

    const requestSeq = materialLibraryRequestSeqRef.current;
    const nextPage = materialLibraryPage + 1;

    setIsMaterialLibraryBusy(true);
    setIsMaterialLibraryLoadingMore(true);

    try {
      await loadMaterialLibraryItems({
        bizType: activeMaterialLibraryBizType,
        groupId: activeMaterialLibraryGroupId,
        mode: "append",
        page: nextPage,
        requestSeq,
      });
    } catch (error) {
      if (
        isMountedRef.current &&
        materialLibraryRequestSeqRef.current === requestSeq
      ) {
        toast.warning(getMaterialErrorMessage(error, "素材加载失败"));
      }
    } finally {
      if (
        isMountedRef.current &&
        materialLibraryRequestSeqRef.current === requestSeq
      ) {
        setIsMaterialLibraryBusy(false);
        setIsMaterialLibraryLoadingMore(false);
      }
    }
  }, [
    activeMaterialLibraryBizType,
    activeMaterialLibraryGroupId,
    hasMoreMaterialLibraryItems,
    isMaterialLibraryLoadingMore,
    isMountedRef,
    loadMaterialLibraryItems,
    materialLibraryPage,
  ]);

  const runCollectedExpressionMutation = useCallback(
    async (
      action: () => Promise<unknown>,
      fallbackMessage: string,
    ) => {
      try {
        await action();

        if (!isMountedRef.current) {
          return;
        }

        await refreshCollectedExpressions();
      } catch (error) {
        if (isMountedRef.current) {
          toast.warning(getMaterialErrorMessage(error, fallbackMessage));
        }
      }
    },
    [isMountedRef, refreshCollectedExpressions],
  );

  const handleTopCollectedExpression = useCallback(
    (item: WorkbenchMaterialCollectionItemDto) => {
      void runCollectedExpressionMutation(
        () => getWorkbenchService().topMaterialCollection(item.id),
        "置顶素材失败",
      );
    },
    [runCollectedExpressionMutation],
  );

  const handleDeleteCollectedExpression = useCallback(
    (item: WorkbenchMaterialCollectionItemDto) => {
      void runCollectedExpressionMutation(
        () => getWorkbenchService().deleteMaterialCollection(item.id),
        "删除素材失败",
      );
    },
    [runCollectedExpressionMutation],
  );

  const runMaterialLibraryMutation = useCallback(
    async (
      bizType: ComposerMaterialBizType,
      action: (bizType: ComposerMaterialBizType) => Promise<unknown>,
      fallbackMessage: string,
      refresh: MaterialLibraryMutationRefresh = "items",
    ) => {
      setIsMaterialLibraryBusy(true);

      try {
        await action(bizType);

        if (!isMountedRef.current) {
          return;
        }

        if (refresh === "items") {
          await reloadActiveMaterialLibraryItems(bizType);
        } else if (refresh === "groups") {
          await reloadMaterialLibraryGroups(bizType);
        } else {
          await reloadMaterialLibraryGroups(bizType, {
            reloadItemsIfActiveGroupRemoved: true,
          });
        }
      } catch (error) {
        if (isMountedRef.current) {
          toast.warning(getMaterialErrorMessage(error, fallbackMessage));
        }
      } finally {
        if (isMountedRef.current) {
          setIsMaterialLibraryBusy(false);
        }
      }
    },
    [isMountedRef, reloadActiveMaterialLibraryItems, reloadMaterialLibraryGroups],
  );

  const handleCreateMaterialGroup = useCallback(
    (title: string) => {
      if (!activeMaterialLibraryBizType) {
        return;
      }

      void runMaterialLibraryMutation(
        activeMaterialLibraryBizType,
        (bizType) =>
          getWorkbenchService().createMaterialGroup({
            bizType,
            title,
          }),
        "新建分组失败",
        "groups",
      );
    },
    [activeMaterialLibraryBizType, runMaterialLibraryMutation],
  );

  const handleRenameMaterialGroup = useCallback(
    (group: WorkbenchMaterialCollectionGroupDto, title: string) => {
      const bizType = toComposerMaterialBizType(group.bizType);

      if (!bizType) {
        return;
      }

      void runMaterialLibraryMutation(
        bizType,
        (bizType) =>
          getWorkbenchService().renameMaterialGroup(group.id, bizType, {
            title,
          }),
        "重命名分组失败",
        "groups",
      );
    },
    [runMaterialLibraryMutation],
  );

  const handleTopMaterialGroup = useCallback(
    (group: WorkbenchMaterialCollectionGroupDto) => {
      const bizType = toComposerMaterialBizType(group.bizType);

      if (!bizType) {
        return;
      }

      void runMaterialLibraryMutation(
        bizType,
        (bizType) => getWorkbenchService().topMaterialGroup(group.id, bizType),
        "置顶分组失败",
        "groups",
      );
    },
    [runMaterialLibraryMutation],
  );

  const handleDeleteMaterialGroup = useCallback(
    (group: WorkbenchMaterialCollectionGroupDto) => {
      const bizType = toComposerMaterialBizType(group.bizType);

      if (!bizType) {
        return;
      }

      void runMaterialLibraryMutation(
        bizType,
        (bizType) => getWorkbenchService().deleteMaterialGroup(group.id, bizType),
        "删除分组失败",
        "groups-and-items-if-active-removed",
      );
    },
    [runMaterialLibraryMutation],
  );

  const handleDeleteMaterial = useCallback(
    (item: WorkbenchMaterialCollectionItemDto) => {
      const bizType = toComposerMaterialBizType(item.bizType);

      if (!bizType) {
        return;
      }

      void runMaterialLibraryMutation(
        bizType,
        () => getWorkbenchService().deleteMaterialCollection(item.id),
        "删除素材失败",
      );
    },
    [runMaterialLibraryMutation],
  );

  const handleTopMaterial = useCallback(
    (item: WorkbenchMaterialCollectionItemDto) => {
      const bizType = toComposerMaterialBizType(item.bizType);

      if (!bizType) {
        return;
      }

      void runMaterialLibraryMutation(
        bizType,
        () => getWorkbenchService().topMaterialCollection(item.id),
        "置顶素材失败",
      );
    },
    [runMaterialLibraryMutation],
  );

  const handleMoveMaterial = useCallback(
    (item: WorkbenchMaterialCollectionItemDto, groupId: string) => {
      const bizType = toComposerMaterialBizType(item.bizType);

      if (!bizType) {
        return;
      }

      void runMaterialLibraryMutation(
        bizType,
        () =>
          getWorkbenchService().moveMaterialCollection(item.id, {
            groupId,
          }),
        "移动素材失败",
      );
    },
    [runMaterialLibraryMutation],
  );

  const handleEditMaterial = useCallback(
    (
      item: WorkbenchMaterialCollectionItemDto,
      values: MaterialContentFormValues,
    ) => {
      const validated = validateMaterialCollectionSubmitFields({
        description:
          item.bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5
            ? values.description
            : undefined,
        fileName:
          item.bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE
            ? values.fileName
            : undefined,
        title:
          item.bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5
            ? values.title
            : undefined,
      });

      if ("errorMsg" in validated) {
        toast.warning(validated.errorMsg);
        return;
      }

      const bizType = toComposerMaterialBizType(item.bizType);

      if (!bizType) {
        return;
      }

      void runMaterialLibraryMutation(
        bizType,
        () =>
          getWorkbenchService().updateMaterialCollection(item.id, validated),
        "编辑素材失败",
      );
    },
    [runMaterialLibraryMutation],
  );

  const resetPendingCollection = useCallback(() => {
    setPendingMaterialCollection(null);
  }, []);

  const resetConversationCollectionState = useCallback(() => {
    setPendingMaterialCollection(null);
    setMaterialCollectionGroups([]);
    setIsCollectingMaterial(false);
  }, []);

  const resetMaterialLibrary = useCallback(() => {
    materialLibraryRequestSeqRef.current += 1;
    setActiveMaterialLibraryBizType(null);
    setActiveMaterialLibraryGroupId(null);
    setMaterialLibraryGroups([]);
    setMaterialLibraryItems([]);
    setMaterialLibraryPage(1);
    setHasMoreMaterialLibraryItems(false);
    setIsMaterialLibraryGroupsLoading(false);
    setIsMaterialLibraryItemsLoading(false);
    setIsMaterialLibraryLoadingMore(false);
    setIsMaterialLibrarySending(false);
    setSendingMaterialId(null);
  }, []);

  const handleSelectMaterial = useCallback(
    async (item: WorkbenchMaterialCollectionItemDto) => {
      if (item.contentType === "sphfeed") {
        toast.warning("视频号发送功能暂未开放");
        return;
      }

      const materialSegment = buildComposerSegmentFromMaterial(item);

      if (!materialSegment) {
        if (item.contentType === "file") {
          toast.warning("文件素材数据异常");
          return;
        }

        if (item.contentType === "h5") {
          toast.warning("H5链接素材数据异常");
          return;
        }

        if (item.contentType === "emotion") {
          toast.warning("表情素材数据异常");
          return;
        }

        toast.warning(getMaterialSendUnavailableMessage(item.contentType));
        return;
      }

      setIsMaterialLibrarySending(true);
      setSendingMaterialId(item.id);
      try {
        const result = await sendAgentMessageSegments([materialSegment]);

        if (!isMountedRef.current) {
          return;
        }

        if (!result.ok) {
          onSendFailure({
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            reason: result.reason,
          });
          return;
        }

        resetMaterialLibrary();
        onSent();
        void requestActiveConversationRead();
      } finally {
        if (isMountedRef.current) {
          setIsMaterialLibrarySending(false);
          setSendingMaterialId(null);
        }
      }
    },
    [
      isMountedRef,
      onSendFailure,
      onSent,
      requestActiveConversationRead,
      resetMaterialLibrary,
      sendAgentMessageSegments,
    ],
  );

  useEffect(() => {
    resetConversationCollectionState();
  }, [resolvedActiveConversationId, resetConversationCollectionState]);

  return {
    activeMaterialLibraryBizType,
    activeMaterialLibraryGroupId,
    collectedExpressions,
    hasMoreCollectedExpressions,
    hasMoreMaterialLibraryItems,
    isCollectedExpressionLoadingMore,
    isCollectingMaterial,
    isMaterialLibraryBusy,
    isMaterialLibraryGroupsLoading,
    isMaterialLibraryItemsLoading,
    isMaterialLibraryLoadingMore,
    isMaterialLibrarySending,
    sendingMaterialId,
    materialCollectionGroups,
    materialLibraryGroups,
    materialLibraryItems,
    pendingMaterialCollection,
    handleCollectMaterial,
    handleCreateMaterialGroup,
    handleCreatePendingMaterialGroup,
    handleDeleteCollectedExpression,
    handleDeleteMaterial,
    handleDeleteMaterialGroup,
    handleEditMaterial,
    handleLoadMoreCollectedExpressions,
    handleLoadMoreMaterialLibraryItems,
    handleMoveMaterial,
    handleOpenCollectedExpressions,
    handleOpenMaterialLibrary,
    handleRenameMaterialGroup,
    handleSelectMaterial,
    handleSelectMaterialLibraryGroup,
    handleSubmitMaterialCollection,
    handleTopCollectedExpression,
    handleTopMaterial,
    handleTopMaterialGroup,
    resetMaterialLibrary,
    resetPendingCollection,
  };
}

function getCollectFormValuesFromMessage(
  message: ChatMessage,
): MaterialContentFormValues {
  if (message.content.type === "file") {
    const fileName = message.content.fileName.trim();

    return {
      description: "",
      fileExtension: resolveMaterialFileExtension(
        fileName,
        message.content.extension,
      ),
      fileName,
      title: "",
    };
  }

  if (message.content.type === "h5") {
    return {
      description: message.content.description.trim(),
      fileExtension: "",
      fileName: "",
      title: message.content.title.trim(),
    };
  }

  return {
    description: "",
    fileExtension: "",
    fileName: "",
    title: "",
  };
}

function getMaterialBizTypeForMessage(
  message: ChatMessage,
): MaterialCollectionBizType | undefined {
  if (message.content.type === "image") {
    return message.content.variant === "emotion"
      ? MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION
      : undefined;
  }

  if (message.content.type === "file") {
    return MATERIAL_COLLECTION_BIZ_TYPE.FILE;
  }

  if (message.content.type === "mini-program") {
    return MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM;
  }

  if (message.content.type === "h5") {
    return MATERIAL_COLLECTION_BIZ_TYPE.H5;
  }

  if (message.content.type === "sphfeed") {
    return MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED;
  }

  return undefined;
}

function readCollectMessageInfoId(message: ChatMessage) {
  const seq = message.seq;

  return typeof seq === "number" && Number.isSafeInteger(seq) && seq > 0
    ? String(seq)
    : undefined;
}

function toComposerMaterialBizType(
  bizType: MaterialCollectionBizType,
): ComposerMaterialBizType | undefined {
  if (
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5 ||
    bizType === MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED
  ) {
    return bizType;
  }

  return undefined;
}

function buildH5ComposerSegment(
  item: WorkbenchMaterialCollectionItemDto,
): ComposerSegment | undefined {
  const materialCollectionId = item.id.trim();
  const contentRecord = isMaterialContentRecord(item.content);
  const title = readMaterialContentString(contentRecord.title) || item.title;
  const href = readMaterialLinkUrl(contentRecord);

  if (!materialCollectionId || !title || !href) {
    return undefined;
  }

  const desc = readMaterialDescription(contentRecord);
  const coverUrl =
    readMaterialContentString(contentRecord.coverUrl) ||
    readMaterialContentString(contentRecord.previewImageUrl) ||
    readMaterialContentString(contentRecord.imageUrl);

  return {
    ...(coverUrl ? { coverUrl } : {}),
    ...(desc ? { desc } : {}),
    href,
    materialCollectionId,
    msgInfoId: item.msgInfoId,
    title,
    type: "h5",
  };
}

function buildExpressionComposerSegment(
  item: WorkbenchMaterialCollectionItemDto,
): ComposerSegment | undefined {
  const materialCollectionId = item.id.trim();
  const contentRecord = isMaterialContentRecord(item.content);
  const imageUrl = readMaterialContentString(contentRecord.fileUrl);

  if (!materialCollectionId || !imageUrl) {
    return undefined;
  }

  return {
    imageUrl,
    materialCollectionId,
    type: "emotion",
  };
}

function isMaterialContentRecord(
  content: WorkbenchMaterialCollectionItemDto["content"],
): Record<string, unknown> {
  return typeof content === "object" && content !== null && !Array.isArray(content)
    ? (content as Record<string, unknown>)
    : {};
}

function buildFileComposerSegment(
  item: WorkbenchMaterialCollectionItemDto,
): ComposerSegment | undefined {
  const materialCollectionId = item.id.trim();
  const contentRecord = isMaterialContentRecord(item.content);
  const fileName = readMaterialContentString(contentRecord.fileName) || item.title;
  const fileUrl = readMaterialContentString(contentRecord.fileUrl);

  if (!materialCollectionId || !fileName || !fileUrl) {
    return undefined;
  }

  const extension =
    readMaterialContentString(contentRecord.extension) || getFileExtension(fileName);
  const fileSizeLabel = readMaterialContentString(contentRecord.fileSizeLabel);

  return {
    extension,
    fileName,
    ...(fileSizeLabel ? { fileSizeLabel } : {}),
    materialCollectionId,
    msgInfoId: item.msgInfoId,
    type: "file",
    url: fileUrl,
  };
}

function buildMiniProgramComposerSegment(
  item: WorkbenchMaterialCollectionItemDto,
): ComposerSegment | undefined {
  const materialCollectionId = item.id.trim();

  if (!materialCollectionId) {
    return undefined;
  }

  const contentRecord = isMaterialContentRecord(item.content);
  const appName =
    readMaterialContentString(contentRecord.appName) ||
    readMaterialContentString(contentRecord.description) ||
    "小程序";
  const title =
    readMaterialContentString(contentRecord.title) || item.title || "小程序";
  const coverImageUrl =
    readMaterialContentString(contentRecord.coverImageUrl) ||
    readMaterialContentString(contentRecord.imageUrl) ||
    readMaterialContentString(contentRecord.fileUrl) ||
    readMaterialContentString(contentRecord.coverUrl);
  const logoUrl = readMaterialContentString(contentRecord.logoUrl);
  const sourceLabel = readMaterialContentString(contentRecord.sourceLabel);

  return {
    appName,
    ...(coverImageUrl ? { coverImageUrl } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    ...(sourceLabel ? { sourceLabel } : {}),
    materialCollectionId,
    msgInfoId: item.msgInfoId,
    title,
    type: "weapp",
  };
}

function buildSphfeedComposerSegment(
  item: WorkbenchMaterialCollectionItemDto,
): ComposerSegment | undefined {
  const materialCollectionId = item.id.trim();

  if (!materialCollectionId) {
    return undefined;
  }

  const contentRecord = isMaterialContentRecord(item.content);
  const description = readMaterialContentString(contentRecord.description);
  const imageUrl = readMaterialContentString(contentRecord.imageUrl);
  const sourceLabel = readMaterialContentString(contentRecord.sourceLabel);
  const title =
    readMaterialContentString(contentRecord.title) || item.title || "视频号";
  const url = readMaterialContentString(contentRecord.url);

  return {
    ...(description ? { description } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    materialCollectionId,
    msgInfoId: item.msgInfoId,
    ...(sourceLabel ? { sourceLabel } : {}),
    title,
    type: "sphfeed",
    ...(url ? { url } : {}),
  };
}

function buildComposerSegmentFromMaterial(
  item: WorkbenchMaterialCollectionItemDto,
): ComposerSegment | undefined {
  if (item.contentType === "emotion") {
    return buildExpressionComposerSegment(item);
  }

  if (item.contentType === "file") {
    return buildFileComposerSegment(item);
  }

  if (item.contentType === "h5") {
    return buildH5ComposerSegment(item);
  }

  if (item.contentType === "mini-program") {
    return buildMiniProgramComposerSegment(item);
  }

  if (item.contentType === "sphfeed") {
    return buildSphfeedComposerSegment(item);
  }

  return undefined;
}

function getMaterialSendUnavailableMessage(
  contentType: WorkbenchMaterialCollectionItemDto["contentType"],
) {
  return "发送功能内测中，即将开放";
}

function readMaterialContentString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getMaterialErrorMessage(error: unknown, fallback: string) {
  if (isErrorWithMessage(error) && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  );
}
