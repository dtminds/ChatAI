import { useEffect, useState } from "react";
import { type WorkflowTemplateConversionRequest, type WorkflowTemplateDetail, type WorkflowTemplateDraftUpdateRequest } from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { WORKFLOW_TEMPLATE_METADATA_DIALOG_CLASS_NAME, WorkflowTemplateMetadataFields, type WorkflowTemplateMetadataValue } from "./workflow-template-metadata-fields";

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
  const [metadata, setMetadata] = useState<WorkflowTemplateMetadataValue>({
    coverUrl: "",
    description: "",
    name: workflowName,
    sortOrder: "0",
    tags: [],
  });
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<WorkflowTemplateDetail | null>(null);
  const submit = async () => {
    if (!metadata.name.trim() || pending) return;
    setPending(true);
    try {
      const parsedSortOrder = Number(metadata.sortOrder);
      if (!Number.isInteger(parsedSortOrder)) return;
      const result = await onConvert({ coverUrl: metadata.coverUrl.trim() || undefined, description: metadata.description.trim(), expectedDraftVersion: draftVersion, name: metadata.name.trim(), sortOrder: parsedSortOrder, tags: metadata.tags });
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
    setMetadata({
      coverUrl: created.coverUrl ?? "",
      description: created.description,
      name: created.name,
      sortOrder: String(created.sortOrder ?? 0),
      tags: created.tags ?? [],
    });
  }, [created]);
  const updateInput = (): WorkflowTemplateDraftUpdateRequest => ({ coverUrl: metadata.coverUrl.trim() || null, description: metadata.description.trim(), name: metadata.name.trim(), sortOrder: Number(metadata.sortOrder), tags: metadata.tags });
  const submitDisabled = pending || !metadata.name.trim() || !metadata.description.trim() || !Number.isInteger(Number(metadata.sortOrder));
  return (
    <Dialog onOpenChange={value => { if (!value) setCreated(null); onOpenChange(value); }} open={open}>
      <DialogContent className={WORKFLOW_TEMPLATE_METADATA_DIALOG_CLASS_NAME}>
        <DialogHeader>
          <DialogTitle>{created ? "模板发布" : "转换为模板"}</DialogTitle>
          {created ? <DialogDescription>发布前可以继续修改模板信息</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-4">
          <WorkflowTemplateMetadataFields onChange={setMetadata} value={metadata} />
          {created ? (
            <div className="space-y-2">
              <p className="text-sm">已生成 {created.configurationItems.length} 项配置</p>
              <ul className="max-h-48 overflow-auto text-sm text-muted-foreground">
                {created.configurationItems.map(item => <li key={item.id}>{item.title}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
        <DialogFooter className="pt-2">
          <Button disabled={pending} onClick={() => onOpenChange(false)} variant="outline">关闭</Button>
          {created && onPublish ? (
            <Button disabled={submitDisabled} onClick={async () => { setPending(true); try { const latest = onUpdateDraft ? await onUpdateDraft(created.id, updateInput()) : created; await onPublish(latest.id); toast.success("模板已发布"); onOpenChange(false); } catch { toast.error("操作失败，请稍后重试"); } finally { setPending(false); } }}>{pending ? "发布中" : "发布模板"}</Button>
          ) : !created ? (
            <Button disabled={submitDisabled} onClick={() => void submit()}>{pending ? "创建中" : "创建模板"}</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
