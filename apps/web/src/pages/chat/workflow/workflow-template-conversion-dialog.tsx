import { useState } from "react";
import { workflowTemplateTagDimensions, type WorkflowTemplateConversionRequest, type WorkflowTemplateDetail } from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function WorkflowTemplateConversionDialog({
  draftVersion,
  onConvert,
  onPublish,
  onOpenChange,
  open,
  workflowName,
}: {
  draftVersion: number;
  onConvert: (input: WorkflowTemplateConversionRequest) => Promise<WorkflowTemplateDetail>;
  onPublish?: (templateId: string) => Promise<WorkflowTemplateDetail>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  workflowName: string;
}) {
  const [name, setName] = useState(workflowName);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<WorkflowTemplateDetail | null>(null);
  const submit = async () => {
    if (!name.trim() || pending) return;
    setPending(true);
    try {
      const result = await onConvert({ description: description.trim(), expectedDraftVersion: draftVersion, name: name.trim(), tags });
      setCreated(result);
      toast.success("模板已创建");
    } catch {
      toast.error("操作失败，请稍后重试");
    } finally {
      setPending(false);
    }
  };
  return <Dialog onOpenChange={value => { if (!value) setCreated(null); onOpenChange(value); }} open={open}><DialogContent><DialogHeader><DialogTitle>{created ? "模板发布" : "转换为模板"}</DialogTitle><DialogDescription>{created ? "请确认配置项后发布模板" : "模板会读取当前已保存的草稿，并清理租户专属资源"}</DialogDescription></DialogHeader>{created ? <div className="space-y-3"><p className="text-sm">已生成 {created.configurationItems.length} 项配置</p><ul className="max-h-48 overflow-auto text-sm text-muted-foreground">{created.configurationItems.map(item => <li key={item.id}>{item.title}</li>)}</ul></div> : <div className="space-y-3"><Input aria-label="模板名称" onChange={e => setName(e.target.value)} value={name} /><Textarea aria-label="模板描述" onChange={e => setDescription(e.target.value)} value={description} /><div aria-label="模板标签" className="space-y-3">{workflowTemplateTagDimensions.map(dimension => <div className="space-y-1.5" key={dimension.id}><div className="text-sm text-muted-foreground">{dimension.label}</div><div className="flex flex-wrap gap-2">{dimension.tags.map(tag => { const selected = tags.includes(tag.id); return <Button aria-pressed={selected} className="h-8" key={tag.id} onClick={() => setTags(current => selected ? current.filter(id => id !== tag.id) : [...current, tag.id])} size="sm" type="button" variant={selected ? "secondary" : "outline"}>{tag.label}</Button>; })}</div></div>)}</div></div>}<DialogFooter><Button onClick={() => onOpenChange(false)} variant="outline">关闭</Button>{created && onPublish ? <Button disabled={pending} onClick={async () => { setPending(true); try { await onPublish(created.id); toast.success("模板已发布"); onOpenChange(false); } catch { toast.error("操作失败，请稍后重试"); } finally { setPending(false); } }}>{pending ? "发布中" : "发布模板"}</Button> : !created ? <Button disabled={pending || !name.trim()} onClick={() => void submit()}>{pending ? "创建中" : "创建模板"}</Button> : null}</DialogFooter></DialogContent></Dialog>;
}
