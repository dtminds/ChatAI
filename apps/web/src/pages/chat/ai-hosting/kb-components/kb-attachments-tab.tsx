import { useMemo, useState } from "react";
import {
  Add01Icon,
  File01Icon,
  Image01Icon,
  PlayIcon,
  Search01Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MiniProgramMark } from "@/pages/chat/components/message/miniapp";
import { KbAddAttachmentDialog } from "./kb-add-attachment-dialog";
import { KbAttachmentsTable } from "./kb-attachments-table";
import {
  kbAttachmentTypeFilters,
  KB_ATTACHMENT_TYPE,
  type KbAttachmentItem,
  type KbAttachmentType,
} from "./kb-attachment-types";

const kbAttachmentInitStorageKey = (kbId: string) => `kb-attachments-init:${kbId}`;

const kbAttachmentInitIllustrationUrl =
  "https://b5.bokr.com.cn/dist/ui/attachment_bg_1.png";

const kbAttachmentEmptyIllustrationUrl =
  "https://b5.bokr.com.cn/dist/ui/attachment_bg_3.png";

const kbAttachmentExampleTagRows = [
  [
    { icon: "file" as const, label: "产品说明书" },
    { icon: "image" as const, label: "营销活动海报" },
    { icon: "poster" as const, label: "直播预告海报" },
    { icon: "video" as const, label: "产品安装视频" },
  ],
  [
    { brand: "mini-program" as const, label: "小程序商城链接" },
    { brand: "wechat" as const, label: "公众号文章" },
    { brand: "xiaohongshu" as const, label: "小红书链接" },
    { brand: "more" as const, label: "..." },
  ],
] as const;

export function KbAttachmentsTab({ kbId }: { kbId: string }) {
  const [initialized, setInitialized] = useState(() => readInitializedState(kbId));
  const [activeType, setActiveType] = useState<KbAttachmentType>(KB_ATTACHMENT_TYPE.IMAGE);
  const [attachments, setAttachments] = useState<KbAttachmentItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KbAttachmentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<"batch" | string | null>(null);

  const filteredAttachments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return attachments.filter((item) => {
      if (item.attachmentType !== activeType) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [item.title, item.description].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }, [activeType, attachments, searchQuery]);

  const selectedCount = selectedIds.length;

  const handleInitialize = () => {
    setInitialized(true);
    writeInitializedState(kbId, true);
  };

  const handleAddAttachment = (item: KbAttachmentItem) => {
    setAttachments((current) => [item, ...current]);
  };

  const handleUpdateAttachment = (item: KbAttachmentItem) => {
    setAttachments((current) =>
      current.map((attachment) => (attachment.id === item.id ? item : attachment)),
    );
  };

  const handleAttachmentDialogSubmit = (item: KbAttachmentItem) => {
    if (editingItem) {
      handleUpdateAttachment(item);
      return;
    }

    handleAddAttachment(item);
  };

  const handleAttachmentDialogOpenChange = (open: boolean) => {
    if (!open) {
      setAddDialogOpen(false);
      setEditingItem(null);
      return;
    }

    setAddDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deleteTarget === "batch") {
      setAttachments((current) =>
        current.filter((item) => !selectedIds.includes(item.id)),
      );
      setSelectedIds([]);
    } else if (deleteTarget) {
      setAttachments((current) => current.filter((item) => item.id !== deleteTarget));
      setSelectedIds((current) => current.filter((id) => id !== deleteTarget));
    }

    setDeleteTarget(null);
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredAttachments.map((item) => item.id));
      return;
    }

    setSelectedIds([]);
  };

  const toggleSelectItem = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(id) ? current : [...current, id];
      }

      return current.filter((itemId) => itemId !== id);
    });
  };

  if (!initialized) {
    return <KbAttachmentsInitState onInitialize={handleInitialize} />;
  }

  return (
    <section aria-label="附件列表区块" className="space-y-4">
      <div
        aria-label="附件类型筛选"
        className="inline-flex h-10 items-center rounded-[10px] bg-muted p-1"
        role="tablist"
      >
        {kbAttachmentTypeFilters.map((filter) => (
          <button
            aria-selected={activeType === filter.value}
            className={cn(
              "inline-flex h-8 min-w-[4.5rem] items-center justify-center rounded-[8px] px-4 text-sm transition-[background-color,box-shadow,color]",
              activeType === filter.value
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-foreground hover:text-foreground",
            )}
            key={filter.value}
            onClick={() => {
              setActiveType(filter.value);
              setSelectedIds([]);
            }}
            role="tab"
            type="button"
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-[280px] max-w-full">
          <HugeiconsIcon
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            color="currentColor"
            icon={Search01Icon}
            size={17}
            strokeWidth={1.8}
          />
          <Input
            aria-label="搜索附件"
            className="h-10 rounded-[8px] pl-9"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索附件"
            value={searchQuery}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="h-10 px-4"
            disabled={selectedCount === 0}
            onClick={() => setDeleteTarget("batch")}
            type="button"
            variant="outline"
          >
            批量删除
          </Button>
          <Button
            className="h-10 gap-2 px-4"
            onClick={() => setAddDialogOpen(true)}
            type="button"
          >
            <HugeiconsIcon color="currentColor" icon={Add01Icon} size={17} strokeWidth={1.8} />
            添加附件
          </Button>
        </div>
      </div>

      {filteredAttachments.length > 0 ? (
        <KbAttachmentsTable
          activeType={activeType}
          items={filteredAttachments}
          onDelete={setDeleteTarget}
          onEdit={setEditingItem}
          onToggleSelectAll={toggleSelectAll}
          onToggleSelectItem={toggleSelectItem}
          selectedIds={selectedIds}
        />
      ) : (
        <KbAttachmentsEmptyState />
      )}

      <KbAddAttachmentDialog
        attachmentType={editingItem?.attachmentType ?? activeType}
        editingItem={editingItem}
        onOpenChange={handleAttachmentDialogOpenChange}
        onSubmit={handleAttachmentDialogSubmit}
        open={addDialogOpen || editingItem != null}
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
      >
        <AlertDialogContent className="max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget === "batch" ? "是否确认批量删除" : "是否确认删除"}
            </AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              删除后无法恢复
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="border-destructive bg-background text-destructive hover:bg-destructive/5"
              onClick={handleConfirmDelete}
            >
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function KbAttachmentsInitState({ onInitialize }: { onInitialize: () => void }) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-10 text-center">
      <img
        alt=""
        aria-hidden="true"
        className="mb-6 h-40 w-40 object-contain"
        src={kbAttachmentInitIllustrationUrl}
      />
      <p className="max-w-md text-sm leading-6 text-muted-foreground">
        附件库需要初始化来完整一些准备工作，如需使用，请点击以下按钮
      </p>
      <Button
        className="mt-6 h-10 px-6"
        onClick={onInitialize}
        type="button"
        variant="outline"
      >
        开始初始化
      </Button>
    </div>
  );
}

function KbAttachmentsEmptyState() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-10 text-center">
      <img
        alt=""
        aria-hidden="true"
        className="mb-6 h-40 w-40 object-contain"
        src={kbAttachmentEmptyIllustrationUrl}
      />

      <div
        aria-hidden="true"
        className="flex max-w-3xl flex-col items-center gap-3"
      >
        {kbAttachmentExampleTagRows.map((row, rowIndex) => (
          <div
            className="flex flex-wrap items-center justify-center gap-2"
            key={rowIndex}
          >
            {row.map((tag) => (
              <span
                className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-muted/70 px-3 text-sm text-muted-foreground"
                key={tag.label}
              >
                {"icon" in tag ? (
                  <KbAttachmentExampleOutlineIcon type={tag.icon} />
                ) : (
                  <KbAttachmentExampleBrandIcon type={tag.brand} />
                )}
                {tag.label}
              </span>
            ))}
          </div>
        ))}
      </div>

      <p className="mt-6 max-w-xl text-sm leading-6 text-muted-foreground">
        你可以添加各类附件，用于 Agent 在做话术推荐或自动回复时，检索并发送该附件
      </p>
    </div>
  );
}

function KbAttachmentExampleOutlineIcon({
  type,
}: {
  type: "file" | "image" | "poster" | "video";
}) {
  const icon =
    type === "file"
      ? File01Icon
      : type === "image"
        ? Image01Icon
        : type === "poster"
          ? Video01Icon
          : PlayIcon;

  return (
    <span className="inline-flex size-5 items-center justify-center text-muted-foreground/80">
      <HugeiconsIcon
        aria-hidden="true"
        color="currentColor"
        icon={icon}
        size={15}
        strokeWidth={1.8}
      />
    </span>
  );
}

function KbAttachmentExampleBrandIcon({
  type,
}: {
  type: "mini-program" | "more" | "wechat" | "xiaohongshu";
}) {
  if (type === "more") {
    return (
      <span className="inline-flex size-5 items-center justify-center text-sm leading-none text-muted-foreground">
        ...
      </span>
    );
  }

  if (type === "mini-program") {
    return (
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-[#7b61ff] text-white">
        <MiniProgramMark className="size-3! text-white" />
      </span>
    );
  }

  if (type === "wechat") {
    return (
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-[#07c160] text-[10px] font-semibold leading-none text-white">
        公
      </span>
    );
  }

  return (
    <span className="inline-flex size-5 items-center justify-center rounded-full bg-[#ff2442] text-[10px] font-semibold leading-none text-white">
      红
    </span>
  );
}

function readInitializedState(kbId: string) {
  if (!kbId || typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(kbAttachmentInitStorageKey(kbId)) === "1";
}

function writeInitializedState(kbId: string, initialized: boolean) {
  if (!kbId || typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    kbAttachmentInitStorageKey(kbId),
    initialized ? "1" : "0",
  );
}
