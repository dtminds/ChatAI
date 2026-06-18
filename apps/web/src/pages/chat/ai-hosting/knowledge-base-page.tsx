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
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
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
    description: "华为产品知识",
    lastUpdatedAt: "2025-06-20 22:02:22",
    createdAt: "2025-06-19 22:02:22",
  },
  {
    id: "kb-2",
    name: "售后问题解答",
    description: "售后问题解答",
    lastUpdatedAt: "2025-06-20 22:02:22",
    createdAt: "2025-06-19 22:02:22",
  },
  {
    id: "kb-3",
    name: "续费话术指引",
    description: "续费话术指引",
    lastUpdatedAt: "2025-06-19 22:02:22",
    createdAt: "2025-06-19 22:02:22",
  },
];

const PAGE_SIZE = 10;

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

    return items.filter((item) => item.name.toLowerCase().includes(normalized));
  }, [items, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, currentPage]);

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

    // 模拟创建（不调用接口）
    const newItem: KnowledgeBaseItem = {
      id: `kb-${Date.now()}`,
      name,
      description: createForm.description,
      lastUpdatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
      createdAt: new Date().toISOString().replace("T", " ").slice(0, 19),
    };

    setItems((prev) => [newItem, ...prev]);
    setCreateSubmitting(false);
    setCreateDialogOpen(false);
    resetCreateForm();
    setCurrentPage(1);
  }

  function handleManage(item: KnowledgeBaseItem) {
    // 占位：后续接入详情/编辑页
    // eslint-disable-next-line no-alert
  }

  return (
    <AiHostingLayout title="知识库">
      <div className="space-y-6">
        <AiHostingPageHeader
          description="为Agent提供产品、服务、常见问题（FAQ）等知识，助其在回复客户消息时更精准"
          title="知识库"
        />

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
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
            </div>

            <Button className="h-10 px-4" onClick={handleOpenCreateDialog} type="button">
              <HugeiconsIcon color="currentColor" icon={Add01Icon} size={17} strokeWidth={1.8} />
              <span>创建知识点</span>
            </Button>
          </div>

          <div className="rounded-[8px] border bg-background">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  <th className="w-[28%] px-4 py-3 font-medium">知识库名称</th>
                  <th className="w-[16%] px-4 py-3 font-medium">知识库描述</th>
                  <th className="w-[20%] px-4 py-3 font-medium">最近更新时间</th>
                  <th className="w-[20%] px-4 py-3 font-medium">创建时间</th>
                  <th className="w-[16%] px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pagedItems.length > 0 ? (
                  pagedItems.map((item) => (
                    <tr className="hover:bg-muted/30" key={item.id}>
                      <td className="px-4 py-3 font-medium text-foreground">{item.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.description}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.lastUpdatedAt}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.createdAt}</td>
                      <td className="px-4 py-3 text-right">
                        <Button className="text-primary" onClick={() => handleManage(item)} type="button" variant="link">
                          管理
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted-foreground" colSpan={5}>
                      暂无知识库数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (currentPage > 1) setCurrentPage(currentPage - 1);
                      }}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        href="#"
                        isActive={page === currentPage}
                        onClick={(event) => {
                          event.preventDefault();
                          setCurrentPage(page);
                        }}
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          ) : null}
        </section>
      </div>

      <Dialog onOpenChange={setCreateDialogOpen} open={createDialogOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>创建知识点</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="kb-name">
                知识库名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="kb-name"
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="请输入"
                value={createForm.name}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kb-desc">知识点描述</Label>
              <Textarea
                className="min-h-[120px] resize-y"
                id="kb-desc"
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="请输入"
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
