import { useEffect, useRef, useState } from "react";
import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TablePinnedCell,
  TablePinnedHead,
  TableRow,
} from "@/components/ui/table";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { Textarea } from "@/components/ui/textarea";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";
import { createKb, listKbs, toKbListViewItem } from "./api/kb-service";
import type { KbListViewItem } from "./kb-types";

type CreateFormState = {
  name: string;
  description: string;
};

const PAGE_SIZE = 10;
const KNOWLEDGE_BASE_NAME_MAX_LENGTH = 30;
const KNOWLEDGE_BASE_DESCRIPTION_MAX_LENGTH = 1000;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

export function KbListPage() {
  const [items, setItems] = useState<KbListViewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [currentPage, setCurrentPage] = useState(1);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>({
    name: "",
    description: "",
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [listReloadKey, setListReloadKey] = useState(0);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery]);

  useEffect(() => {
    let cancelled = false;

    async function loadKbs() {
      setLoading(true);

      try {
        const response = await listKbs({
          page: currentPage,
          pageSize: PAGE_SIZE,
          query: debouncedSearchQuery,
        });

        if (cancelled) {
          return;
        }

        setItems(response.kbs.map(toKbListViewItem));
        setTotal(response.pagination.total);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadKbs();

    return () => {
      cancelled = true;
    };
  }, [currentPage, debouncedSearchQuery, listReloadKey]);

  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: PAGE_SIZE,
    total,
  });
  const pagedItems = items;

  function resetCreateForm() {
    setCreateForm({ name: "", description: "" });
  }

  function handleOpenCreateDialog() {
    resetCreateForm();
    setCreateDialogOpen(true);
  }

  function handleCloseCreateDialog() {
    if (createSubmitting) {
      return;
    }

    setCreateDialogOpen(false);
    resetCreateForm();
  }

  async function handleCreateSubmit() {
    const name = createForm.name.trim();

    if (!name) {
      return;
    }

    setCreateSubmitting(true);

    try {
      await createKb({
        description: createForm.description.trim() || undefined,
        name,
      });

      if (!isMountedRef.current) {
        return;
      }

      setCreateDialogOpen(false);
      resetCreateForm();
      setCurrentPage(1);
      setListReloadKey((value) => value + 1);
    } finally {
      if (isMountedRef.current) {
        setCreateSubmitting(false);
      }
    }
  }

  return (
    <AiHostingLayout title="知识库">
      <div className="space-y-6">
        <AiHostingPageHeader
          description="为智能体补充私有知识，智能体在生成回答前会先从知识库检索相关内容，从而提升回答的准确性"
          title="知识库"
        />

        <section className="space-y-4">
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
                aria-label="搜索知识库"
                className="h-10 rounded-[8px] pl-9"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索知识库"
                value={searchQuery}
              />
            </div>

            <Button className="h-10 px-4" onClick={handleOpenCreateDialog} type="button">
              <HugeiconsIcon color="currentColor" icon={Add01Icon} size={17} strokeWidth={1.8} />
              <span>创建知识库</span>
            </Button>
          </div>

          <div>
            <Table className="min-w-[1120px] table-fixed">
              <colgroup>
                <col className="w-[240px]" />
                <col className="w-[360px]" />
                <col className="w-[190px]" />
                <col className="w-[190px]" />
                <col className="w-[140px]" />
              </colgroup>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-11 px-4">知识库名称</TableHead>
                  <TableHead className="h-11 px-4">描述</TableHead>
                  <TableHead className="h-11 whitespace-nowrap px-4">最近更新时间</TableHead>
                  <TableHead className="h-11 whitespace-nowrap px-4">创建时间</TableHead>
                  <TablePinnedHead className="h-11 whitespace-nowrap px-4 text-right">
                    操作
                  </TablePinnedHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell className="py-10 text-center text-sm text-muted-foreground" colSpan={5}>
                      加载中
                    </TableCell>
                  </TableRow>
                ) : pagedItems.length > 0 ? (
                  pagedItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell
                        className="px-4 py-4 font-medium text-foreground"
                        title={item.name}
                      >
                        <TableCellContent>
                          <Link
                            className="truncate text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                            to={`/chat/ai-hosting/kb/${item.id}`}
                          >
                            {item.name}
                          </Link>
                        </TableCellContent>
                      </TableCell>
                      <TableCell
                        className="px-4 py-4 text-muted-foreground"
                        title={item.description}
                      >
                        <TableCellContent>{item.description || "-"}</TableCellContent>
                      </TableCell>
                      <TableCell
                        className="px-4 py-4 text-muted-foreground"
                        title={item.lastUpdatedAt}
                      >
                        <TableCellContent>{item.lastUpdatedAt}</TableCellContent>
                      </TableCell>
                      <TableCell
                        className="px-4 py-4 text-muted-foreground"
                        title={item.createdAt}
                      >
                        <TableCellContent>{item.createdAt}</TableCellContent>
                      </TableCell>
                      <TablePinnedCell className="whitespace-nowrap px-4 py-4 text-right">
                        <Button asChild className="h-auto p-0 text-primary" type="button" variant="link">
                          <Link to={`/chat/ai-hosting/kb/${item.id}`}>
                            查看
                          </Link>
                        </Button>
                      </TablePinnedCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell className="py-10 text-center text-sm text-muted-foreground" colSpan={5}>
                      暂无数据
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination
              onPageChange={setCurrentPage}
              page={activePage}
              total={total}
              totalPages={totalPages}
            />
          </div>
        </section>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open && createSubmitting) {
            return;
          }

          setCreateDialogOpen(open);

          if (!open) {
            resetCreateForm();
          }
        }}
        open={createDialogOpen}
      >
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>创建知识库</DialogTitle>
          </DialogHeader>

          <KnowledgeBaseDialogForm
            descriptionInputId="kb-desc"
            form={createForm}
            nameInputId="kb-name"
            onChange={setCreateForm}
          />

          <DialogFooter className="gap-2">
            <Button disabled={createSubmitting} onClick={handleCloseCreateDialog} type="button" variant="outline">
              取消
            </Button>
            <Button
              disabled={createSubmitting || !createForm.name.trim()}
              onClick={() => void handleCreateSubmit()}
              type="button"
            >
              {createSubmitting ? "提交中" : "确定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AiHostingLayout>
  );
}

function KnowledgeBaseDialogForm({
  descriptionInputId,
  form,
  nameInputId,
  onChange,
}: {
  descriptionInputId: string;
  form: CreateFormState;
  nameInputId: string;
  onChange: (updater: (prev: CreateFormState) => CreateFormState) => void;
}) {
  return (
    <div className="space-y-5 py-2">
      <div className="space-y-2">
        <Label htmlFor={nameInputId}>
          知识库名称 <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <Input
            className="pr-16"
            id={nameInputId}
            maxLength={KNOWLEDGE_BASE_NAME_MAX_LENGTH}
            onChange={(event) => onChange((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="请输入"
            value={form.name}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {form.name.length}/{KNOWLEDGE_BASE_NAME_MAX_LENGTH}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={descriptionInputId}>知识库描述</Label>
        <Textarea
          className="min-h-[120px] resize-y"
          id={descriptionInputId}
          maxLength={KNOWLEDGE_BASE_DESCRIPTION_MAX_LENGTH}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, description: event.target.value }))
          }
          placeholder="说明知识库的内容和用途，描述会用于指导智能体调用知识库"
          value={form.description}
        />
      </div>
    </div>
  );
}
