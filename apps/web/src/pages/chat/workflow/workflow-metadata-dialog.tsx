import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type WorkflowMetadata = {
  description: string;
  name: string;
};

export function WorkflowMetadataDialog({
  error,
  metadata,
  onOpenChange,
  onSave,
  open,
  pending = false,
}: {
  error?: string | null;
  metadata: WorkflowMetadata;
  onOpenChange: (open: boolean) => void;
  onSave: (metadata: WorkflowMetadata) => Promise<boolean>;
  open: boolean;
  pending?: boolean;
}) {
  const [nameValue, setNameValue] = useState(metadata.name);
  const [descriptionValue, setDescriptionValue] = useState(metadata.description);

  useEffect(() => {
    setNameValue(metadata.name);
    setDescriptionValue(metadata.description);
  }, [metadata.description, metadata.name]);

  const submitMetadata = async () => {
    const normalizedMetadata = {
      description: descriptionValue.trim(),
      name: nameValue.trim(),
    };
    if (!normalizedMetadata.name) return;
    if (normalizedMetadata.name === metadata.name
      && normalizedMetadata.description === metadata.description) {
      onOpenChange(false);
      return;
    }
    if (await onSave(normalizedMetadata)) onOpenChange(false);
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent aria-describedby={undefined} closeButtonDisabled={pending}>
        <DialogHeader>
          <DialogTitle>编辑 Workflow 信息</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submitMetadata();
          }}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium" htmlFor="workflow-metadata-name">Workflow 名称</label>
              <span className="text-xs text-muted-foreground">{nameValue.length}/100</span>
            </div>
            <Input
              autoFocus
              id="workflow-metadata-name"
              maxLength={100}
              onChange={(event) => setNameValue(event.target.value)}
              readOnly={pending}
              value={nameValue}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium" htmlFor="workflow-metadata-description">Workflow 描述</label>
              <span className="text-xs text-muted-foreground">{descriptionValue.length}/1000</span>
            </div>
            <Textarea
              id="workflow-metadata-description"
              maxLength={1000}
              onChange={(event) => setDescriptionValue(event.target.value)}
              placeholder="填写 Workflow 的用途或目标"
              readOnly={pending}
              value={descriptionValue}
            />
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button disabled={!nameValue.trim() || pending} type="submit">
              {pending ? "保存中" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
