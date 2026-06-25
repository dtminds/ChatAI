import { useMemo, useState, useSyncExternalStore } from "react";
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
import {
  addMockKnowledgeBase,
  getMockKnowledgeBasesSnapshot,
  subscribeMockKnowledgeBases,
  type KnowledgeBaseItem,
} from "./kb-mock-data";

type CreateFormState = {
  name: string;
  description: string;
};

const PAGE_SIZE = 10;
const KNOWLEDGE_BASE_NAME_MAX_LENGTH = 30;
const KNOWLEDGE_BASE_DESCRIPTION_MAX_LENGTH = 1000;

function getLocalTimeString(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
}

export function KbListPage() {
  const items = useSyncExternalStore(
    subscribeMockKnowledgeBases,
    getMockKnowledgeBasesSnapshot,
    getMockKnowledgeBasesSnapshot,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>({
    name: "",
    description: "",
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeBaseItem | null>(null);
  const [editForm, setEditForm] = useState<CreateFormState>({
    name: "",
    description: "",
  });

  const filteredItems = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();

    if (!normalized) {
      return items;
    }

    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(normalized) ||
        item.description.toLowerCase().includes(normalized),
    );
  }, [items, searchQuery]);

  const { activePage, totalPages } = resolveTablePagination({
    page: currentPage,
    pageSize: PAGE_SIZE,
    total: filteredItems.length,
  });
  const pagedItems = useMemo(() => {
    const start = (activePage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, activePage]);

  function resetCreateForm() {
    setCreateForm({ name: "", description: "" });
  }

  function handleOpenCreateDialog() {
    resetCreateForm();
    setCreateDialogOpen(true);
  }

  function handleCloseCreateDialog() {
    if (createSubmitting) return;
    setCreateDialogOpen(false);
    resetCreateForm();
  }

  function handleCreateSubmit() {
    const name = createForm.name.trim();
    if (!name) return;

    setCreateSubmitting(true);

    const nowStr = getLocalTimeString();
    const newItem: KnowledgeBaseItem = {
      id: String(Date.now()),
      name,
      description: createForm.description.trim(),
      lastUpdatedAt: nowStr,
      createdAt: nowStr,
    };

    addMockKnowledgeBase(newItem);
    setCreateSubmitting(false);
    setCreateDialogOpen(false);
    resetCreateForm();
    setCurrentPage(1);
  }

  function resetEditForm() {
    setEditForm({ name: "", description: "" });
  }

  function handleOpenEditDialog(item: KnowledgeBaseItem) {
    setEditingItem(item);
    setEditForm({ name: item.name, description: item.description });
  }

  function handleCloseEditDialog() {
    setEditingItem(null);
    resetEditForm();
  }

  function handleEditSubmit() {
    if (!editForm.name.trim()) return;
    handleCloseEditDialog();
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
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setCurrentPage(1);
                }}
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
                {pagedItems.length > 0 ? (
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
                        <div className="flex items-center justify-end gap-3">
                          <Button asChild className="h-auto p-0 text-primary" type="button" variant="link">
                            <Link to={`/chat/ai-hosting/kb/${item.id}`}>
                              查看
                            </Link>
                          </Button>
                          <Button
                            className="h-auto p-0 text-primary"
                            onClick={() => handleOpenEditDialog(item)}
                            type="button"
                            variant="link"
                          >
                            编辑
                          </Button>
                          <Button className="h-auto p-0 text-primary" type="button" variant="link">
                            删除
                          </Button>
                        </div>
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
              total={filteredItems.length}
              totalPages={totalPages}
            />
          </div>
        </section>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open && createSubmitting) return;
          setCreateDialogOpen(open);
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
              onClick={handleCreateSubmit}
              type="button"
            >
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            handleCloseEditDialog();
          }
        }}
        open={editingItem !== null}
      >
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>编辑知识库</DialogTitle>
          </DialogHeader>

          <KnowledgeBaseDialogForm
            descriptionInputId="kb-edit-desc"
            form={editForm}
            nameInputId="kb-edit-name"
            onChange={setEditForm}
          />

          <DialogFooter className="gap-2">
            <Button onClick={handleCloseEditDialog} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={!editForm.name.trim()} onClick={handleEditSubmit} type="button">
              保存
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
