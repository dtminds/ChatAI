import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { createWorkflowTemplateRepository } from "./workflow-template-repository";
import { useWorkflowSurface } from "./workflow-surface";
import type { WorkflowTemplateDetail, WorkflowTemplateListItem } from "@chatai/contracts";

export function WorkflowTemplateSection() {
  const surface = useWorkflowSurface();
  const repo = createWorkflowTemplateRepository(undefined, surface.apiBasePath.replace(/\/workflows$/, ""));
  const navigate = useNavigate();
  const [items, setItems] = useState<WorkflowTemplateListItem[]>([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<WorkflowTemplateDetail | null>(null);
  const [query, setQuery] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = async (featured = true, next?: string) => { setLoading(true); try { const page = await repo.list({ featured, limit: featured ? 4 : 8, query: featured ? undefined : query, cursor: next }); setItems(page.items); setNextCursor(page.nextCursor); } catch { toast.error("操作失败，请稍后重试"); } finally { setLoading(false); } };
  useEffect(() => { void load(true); }, [surface.apiBasePath]);
  return <section aria-label="推荐模板" className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-base font-semibold">推荐模板</h2><Button variant="ghost" onClick={() => { setOpen(true); void load(false); }}>查看更多</Button></div>{loading ? <div role="status"><Spinner /></div> : <div className="grid gap-3 md:grid-cols-4">{items.map(item => <button className="rounded-lg border p-4 text-left hover:bg-muted" key={item.id} onClick={() => void repo.get(item.id).then(setDetail)}><div className="font-medium">{item.name}</div><div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</div><div className="mt-2 text-xs text-muted-foreground">{item.category}</div></button>)}</div>}<Dialog onOpenChange={v => { setOpen(v); if (!v) setDetail(null); }} open={open}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{detail ? detail.name : "模板中心"}</DialogTitle></DialogHeader>{detail ? <div className="space-y-4"><p className="text-sm text-muted-foreground">{detail.description}</p><div className="rounded border p-3 text-sm">节点数：{detail.nodeCount}</div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDetail(null)}>返回</Button><Button onClick={async () => { try { const result = await repo.apply(detail.id); setOpen(false); navigate(`/chat/workflows/${result.id}`); } catch { toast.error("操作失败，请稍后重试"); } }}>一键应用</Button></div></div> : <div className="space-y-4"><Input aria-label="搜索模板" onChange={e => setQuery(e.target.value)} value={query} /><div className="grid gap-3 md:grid-cols-2">{items.map(item => <button className="rounded-lg border p-3 text-left" key={item.id} onClick={() => void repo.get(item.id).then(setDetail)}><div className="font-medium">{item.name}</div><div className="text-sm text-muted-foreground">{item.description}</div></button>)}</div><div className="flex justify-end"><Button disabled={!nextCursor} onClick={() => { void load(false, nextCursor ?? undefined); }}>下一页</Button></div></div>}</DialogContent></Dialog></section>;
}
