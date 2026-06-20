import { useMemo, useState } from "react";
import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  resolveTablePagination,
  TablePagination,
} from "@/components/ui/table-pagination";
import { Textarea } from "@/components/ui/textarea";
import { AiHostingLayout, AiHostingPageHeader } from "./ai-hosting-layout";

type KnowledgeBaseItem = {
  id: string;
  name: string;
  description: string;
  lastUpdatedAt: string;
  createdAt: string;
};

type CreateFormState = {
  name: string;
  description: string;
};

const MOCK_KNOWLEDGE_BASES: KnowledgeBaseItem[] = [
  {
    id: "kb-1",
    name: "华为产品知识",
    description: "华为各系列产品规格、功能与常见问题",
    lastUpdatedAt: "2025-06-20 22:02:22",
    createdAt: "2025-06-19 22:02:22",
  },
  {
    id: "kb-2",
    name: "售后问题解答",
    description: "退换货、维修、保修流程与话术",
    lastUpdatedAt: "2025-06-20 22:02:22",
    createdAt: "2025-06-19 22:02:22",
  },
  {
    id: "kb-3",
    name: "续费话术指引",
    description: "不同场景下的续费引导话术与案例",
    lastUpdatedAt: "2025-06-19 22:02:22",
    createdAt: "2025-06-19 22:02:22",
  },
];

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

export function KnowledgeBasePage() {
  const [items, setItems] = useState<KnowledgeBaseItem[]>(MOCK_KNOWLEDGE_BASES);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>({
    name: "",
    description: "",
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);

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

  const { activePage, endRow, startRow, totalPages } = resolveTablePagination({
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
      id: `kb-${Date.now()}`,
      name,
      description: createForm.description.trim(),
      lastUpdatedAt: nowStr,
      createdAt: nowStr,
    };

    setItems((prev) => [newItem, ...prev]);
    setCreateSubmitting(false);
    setCreateDialogOpen(false);
    resetCreateForm();
    setCurrentPage(1);
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
            <div className="relative w-full max-w-[280px]">
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

          <div className="overflow-hidden rounded-[8px] border bg-background">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[22%] px-5 py-4">知识库名称</TableHead>
                  <TableHead className="w-[38%] px-5 py-4">描述</TableHead>
                  <TableHead className="w-[20%] px-5 py-4">最近更新时间</TableHead>
                  <TableHead className="w-[20%] px-5 py-4">创建时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedItems.length > 0 ? (
                  pagedItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell
                        className="truncate px-5 py-4 font-medium text-foreground"
                        title={item.name}
                      >
                        {item.name}
                      </TableCell>
                      <TableCell
                        className="truncate px-5 py-4 text-muted-foreground"
                        title={item.description}
                      >
                        {item.description || "-"}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-muted-foreground">{item.lastUpdatedAt}</TableCell>
                      <TableCell className="px-5 py-4 text-muted-foreground">{item.createdAt}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell className="px-5 py-10 text-center text-sm text-muted-foreground" colSpan={4}>
                      暂无数据
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination
              className="px-5"
              endRow={endRow}
              onPageChange={setCurrentPage}
              page={activePage}
              startRow={startRow}
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

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="kb-name">
                知识库名称 <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  className="pr-16"
                  id="kb-name"
                  maxLength={KNOWLEDGE_BASE_NAME_MAX_LENGTH}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="请输入"
                  value={createForm.name}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {createForm.name.length}/{KNOWLEDGE_BASE_NAME_MAX_LENGTH}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="kb-desc">知识库描述</Label>
              <Textarea
                className="min-h-[120px] resize-y"
                id="kb-desc"
                maxLength={KNOWLEDGE_BASE_DESCRIPTION_MAX_LENGTH}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="说明知识库的内容和用途，描述会用于指导智能体调用知识库"
                value={createForm.description}
              />
            </div>
          </div>

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
    </AiHostingLayout>
  );
}
