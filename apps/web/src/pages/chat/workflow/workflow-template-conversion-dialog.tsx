import { useCallback, useEffect, useState } from "react";
import {
  type WorkflowTemplateConversionRequest,
  type WorkflowTemplateDetail,
  type WorkflowTemplateDraftUpdateRequest,
  type WorkflowTemplateListItem,
  type WorkflowTemplateListPage,
  type WorkflowType,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getWorkflowOperationErrorMessage } from "./workflow-error-messages";
import { WORKFLOW_TEMPLATE_METADATA_DIALOG_CLASS_NAME, WorkflowTemplateMetadataFields, type WorkflowTemplateMetadataValue } from "./workflow-template-metadata-fields";

const NEW_TEMPLATE_VALUE = "new";

function createNewTemplateMetadata(workflowName: string): WorkflowTemplateMetadataValue {
  return {
    coverUrl: "",
    description: "",
    name: workflowName,
    sortOrder: "0",
    tags: [],
  };
}

export function WorkflowTemplateConversionDialog({
  draftVersion,
  onConvert,
  onListDrafts,
  onPublish,
  onUpdateDraft,
  onOpenChange,
  open,
  workflowName,
  workflowType,
}: {
  draftVersion: number;
  onConvert: (input: WorkflowTemplateConversionRequest) => Promise<WorkflowTemplateDetail>;
  onListDrafts?: (input: { limit: number; page: number; workflowType: WorkflowType }) => Promise<WorkflowTemplateListPage>;
  onPublish?: (templateId: string) => Promise<WorkflowTemplateDetail>;
  onUpdateDraft?: (templateId: string, input: WorkflowTemplateDraftUpdateRequest) => Promise<WorkflowTemplateDetail>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  workflowName: string;
  workflowType: WorkflowType;
}) {
  const [metadata, setMetadata] = useState<WorkflowTemplateMetadataValue>(() => createNewTemplateMetadata(workflowName));
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<WorkflowTemplateDetail | null>(null);
  const [drafts, setDrafts] = useState<WorkflowTemplateListItem[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftsError, setDraftsError] = useState(false);
  const [targetTemplateId, setTargetTemplateId] = useState<string | null>(null);
  const loadDrafts = useCallback(async () => {
    if (!onListDrafts) return;
    setDraftsLoading(true);
    setDraftsError(false);
    try {
      const result = await onListDrafts({ limit: 50, page: 1, workflowType });
      setDrafts(result.items);
    } catch {
      setDraftsError(true);
    } finally {
      setDraftsLoading(false);
    }
  }, [onListDrafts, workflowType]);
  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setTargetTemplateId(null);
    setMetadata(createNewTemplateMetadata(workflowName));
    void loadDrafts();
  }, [loadDrafts, open, workflowName]);
  const selectTargetTemplate = (value: string) => {
    if (value === NEW_TEMPLATE_VALUE) {
      setTargetTemplateId(null);
      setMetadata(createNewTemplateMetadata(workflowName));
      return;
    }
    const target = drafts.find(item => item.id === value);
    if (!target) return;
    setTargetTemplateId(target.id);
    setMetadata({
      coverUrl: target.coverUrl ?? "",
      description: target.description,
      name: target.name,
      sortOrder: String(target.sortOrder ?? 0),
      tags: target.tags ?? [],
    });
  };
  const submit = async () => {
    if (!metadata.name.trim() || pending) return;
    setPending(true);
    try {
      const parsedSortOrder = Number(metadata.sortOrder);
      if (!Number.isInteger(parsedSortOrder)) return;
      const result = await onConvert({
        coverUrl: metadata.coverUrl.trim() || undefined,
        description: metadata.description.trim(),
        expectedDraftVersion: draftVersion,
        name: metadata.name.trim(),
        sortOrder: parsedSortOrder,
        tags: metadata.tags,
        targetTemplateId: targetTemplateId ?? undefined,
      });
      setCreated(result);
      toast.success(targetTemplateId ? "模板已更新" : "模板已创建");
    } catch (error) {
      toast.error(getWorkflowOperationErrorMessage(error));
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
          {!created && onListDrafts ? (
            <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-4">
              <Label className="pt-2" htmlFor="workflow-template-conversion-target">保存到</Label>
              <div className="space-y-2">
                <Select onValueChange={selectTargetTemplate} value={targetTemplateId ?? NEW_TEMPLATE_VALUE}>
                  <SelectTrigger aria-label="保存到" className="w-full" disabled={draftsLoading} id="workflow-template-conversion-target">
                    <SelectValue placeholder={draftsLoading ? "正在加载" : "选择模板"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NEW_TEMPLATE_VALUE}>新建模板</SelectItem>
                    {drafts.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {draftsError ? <Button className="h-8" onClick={() => void loadDrafts()} size="sm" type="button" variant="outline">重试</Button> : null}
              </div>
            </div>
          ) : null}
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
            <Button disabled={submitDisabled} onClick={() => void submit()}>{pending ? (targetTemplateId ? "更新中" : "创建中") : (targetTemplateId ? "更新模板" : "创建模板")}</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
