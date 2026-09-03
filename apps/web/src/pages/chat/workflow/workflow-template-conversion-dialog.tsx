import { useEffect, useState } from "react";
import { workflowTemplateTagDimensions, type WorkflowTemplateConversionRequest, type WorkflowTemplateDetail, type WorkflowTemplateDraftUpdateRequest } from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function WorkflowTemplateConversionDialog({
  draftVersion,
  onConvert,
  onPublish,
  onUpdateDraft,
  onOpenChange,
  open,
  workflowName,
}: {
  draftVersion: number;
  onConvert: (input: WorkflowTemplateConversionRequest) => Promise<WorkflowTemplateDetail>;
  onPublish?: (templateId: string) => Promise<WorkflowTemplateDetail>;
  onUpdateDraft?: (templateId: string, input: WorkflowTemplateDraftUpdateRequest) => Promise<WorkflowTemplateDetail>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  workflowName: string;
}) {
  const [name, setName] = useState(workflowName);
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [tags, setTags] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<WorkflowTemplateDetail | null>(null);
  const submit = async () => {
    if (!name.trim() || pending) return;
    setPending(true);
    try {
      const parsedSortOrder = Number(sortOrder);
      if (!Number.isInteger(parsedSortOrder)) return;
      const result = await onConvert({ coverUrl: coverUrl.trim() || undefined, description: description.trim(), expectedDraftVersion: draftVersion, name: name.trim(), sortOrder: parsedSortOrder, tags });
      setCreated(result);
      toast.success("模板已创建");
    } catch {
      toast.error("操作失败，请稍后重试");
    } finally {
      setPending(false);
    }
  };
  useEffect(() => {
    if (!created) return;
    setName(created.name);
    setDescription(created.description);
    setCoverUrl(created.coverUrl ?? "");
    setSortOrder(String(created.sortOrder ?? 0));
    setTags(created.tags ?? []);
  }, [created]);
  const metadata = <div className="space-y-3">
    <Input aria-label="模板名称" onChange={e => setName(e.target.value)} placeholder="请输入模板名称" value={name} />
    <Textarea aria-label="模板描述" onChange={e => setDescription(e.target.value)} placeholder="请输入模板描述" required value={description} />
    <Input aria-label="模板图片 URL" onChange={e => setCoverUrl(e.target.value)} placeholder="请输入模板图片 URL（可选）" value={coverUrl} />
    <Input aria-label="模板排序值" inputMode="numeric" onChange={e => setSortOrder(e.target.value)} placeholder="请输入模板排序值" type="number" value={sortOrder} />
    <div aria-label="模板标签" className="space-y-3">{workflowTemplateTagDimensions.map(dimension => <div className="space-y-1.5" key={dimension.id}><div className="text-sm text-muted-foreground">{dimension.label}</div><div className="flex flex-wrap gap-2">{dimension.tags.map(tag => { const selected = tags.includes(tag.id); return <Button aria-pressed={selected} className="h-8" key={tag.id} onClick={() => setTags(current => selected ? current.filter(id => id !== tag.id) : [...current, tag.id])} size="sm" type="button" variant={selected ? "secondary" : "outline"}>{tag.label}</Button>; })}</div></div>)}</div>
  </div>;
  const updateInput = (): WorkflowTemplateDraftUpdateRequest => ({ coverUrl: coverUrl.trim() || null, description: description.trim(), name: name.trim(), sortOrder: Number(sortOrder), tags });
  return <Dialog onOpenChange={value => { if (!value) setCreated(null); onOpenChange(value); }} open={open}><DialogContent><DialogHeader><DialogTitle>{created ? "模板发布" : "转换为模板"}</DialogTitle>{created ? <DialogDescription>发布前可以继续修改模板信息</DialogDescription> : null}</DialogHeader>{created ? <div className="space-y-4">{metadata}<div className="space-y-2"><p className="text-sm">已生成 {created.configurationItems.length} 项配置</p><ul className="max-h-48 overflow-auto text-sm text-muted-foreground">{created.configurationItems.map(item => <li key={item.id}>{item.title}</li>)}</ul></div></div> : metadata}<DialogFooter><Button onClick={() => onOpenChange(false)} variant="outline">关闭</Button>{created && onPublish ? <Button disabled={pending || !name.trim() || !description.trim() || !Number.isInteger(Number(sortOrder))} onClick={async () => { setPending(true); try { const latest = onUpdateDraft ? await onUpdateDraft(created.id, updateInput()) : created; await onPublish(latest.id); toast.success("模板已发布"); onOpenChange(false); } catch { toast.error("操作失败，请稍后重试"); } finally { setPending(false); } }}>{pending ? "发布中" : "发布模板"}</Button> : !created ? <Button disabled={pending || !name.trim() || !description.trim() || !Number.isInteger(Number(sortOrder))} onClick={() => void submit()}>{pending ? "创建中" : "创建模板"}</Button> : null}</DialogFooter></DialogContent></Dialog>;
}
