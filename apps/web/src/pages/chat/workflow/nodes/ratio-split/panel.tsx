import { useEffect, useState } from "react";
import {
  WORKFLOW_RATIO_SPLIT_GROUP_MAX,
  WORKFLOW_RATIO_SPLIT_GROUP_MIN,
  WORKFLOW_RATIO_SPLIT_TOTAL_BASIS_POINTS,
  getWorkflowRatioSplitBasisPointsTotal,
  type WorkflowRatioSplitDraftGroup,
} from "@chatai/contracts";
import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkflowSettingsSection } from "../../panels/settings-section";
import type { NodeSettingsProps } from "../../panels/types";
import {
  addWorkflowRatioSplitGroup,
  formatBasisPoints,
  getWorkflowRatioSplitGroups,
  removeWorkflowRatioSplitGroup,
} from "./groups";

export function RatioSplitConfig({ edges, node, onNodeChange }: NodeSettingsProps<"ratio-split">) {
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<WorkflowRatioSplitDraftGroup | null>(null);
  const groups = getWorkflowRatioSplitGroups(node.data);
  const totalBasisPoints = getWorkflowRatioSplitBasisPointsTotal(groups);

  const updateGroups = (nextGroups: WorkflowRatioSplitDraftGroup[]) => {
    onNodeChange({ groups: nextGroups });
  };
  const updateGroup = (groupId: string, patch: Partial<WorkflowRatioSplitDraftGroup>) => {
    updateGroups(groups.map(group => group.id === groupId ? { ...group, ...patch, id: group.id } : group));
  };
  const deleteGroup = (group: WorkflowRatioSplitDraftGroup) => {
    updateGroups(removeWorkflowRatioSplitGroup(groups, group.id));
    setPendingDeleteGroup(null);
  };
  const requestDeleteGroup = (group: WorkflowRatioSplitDraftGroup) => {
    const connected = edges.some(edge => edge.source === node.id && edge.sourceHandle === group.id);
    if (connected) {
      setPendingDeleteGroup(group);
      return;
    }
    deleteGroup(group);
  };

  return (
    <WorkflowSettingsSection title="分流设置">
      <div className="space-y-3">
        {groups.map((group, index) => (
          <section
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 rounded-[8px] border p-3"
            key={group.id}
          >
            <Label htmlFor={`ratio-split-label-${node.id}-${group.id}`}>
              分组 {String.fromCharCode(65 + index)}
            </Label>
            <Input
              id={`ratio-split-label-${node.id}-${group.id}`}
              maxLength={32}
              onChange={event => updateGroup(group.id, { label: event.target.value })}
              value={group.label}
            />
            <Button
              aria-label={`删除${group.label || `分组 ${String.fromCharCode(65 + index)}`}`}
              className="size-7 p-0 text-destructive hover:text-destructive"
              disabled={groups.length <= WORKFLOW_RATIO_SPLIT_GROUP_MIN}
              onClick={() => requestDeleteGroup(group)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.8} />
            </Button>
            <Label htmlFor={`ratio-split-percentage-${node.id}-${group.id}`}>分流比例</Label>
            <PercentageInput
              basisPoints={group.basisPoints}
              id={`ratio-split-percentage-${node.id}-${group.id}`}
              onChange={basisPoints => updateGroup(group.id, { basisPoints })}
            />
          </section>
        ))}

        <Button
          className="h-9 w-full rounded-[8px]"
          disabled={groups.length >= WORKFLOW_RATIO_SPLIT_GROUP_MAX}
          onClick={() => updateGroups(addWorkflowRatioSplitGroup(groups))}
          type="button"
          variant="outline"
        >
          <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.8} />
          添加分组
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        比例合计 {formatBasisPoints(totalBasisPoints)}
        {totalBasisPoints === WORKFLOW_RATIO_SPLIT_TOTAL_BASIS_POINTS ? "" : "，发布前需调整为 100%"}
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        同一流程对象在分组和比例不变时会进入同一分组；所有分组都需要连接后才能发布
      </p>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setPendingDeleteGroup(null);
        }}
        open={Boolean(pendingDeleteGroup)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除分组</AlertDialogTitle>
            <AlertDialogDescription>删除后，该分组对应的下游连线也会被删除</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteGroup) deleteGroup(pendingDeleteGroup);
              }}
              variant="destructive"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkflowSettingsSection>
  );
}

function PercentageInput({
  basisPoints,
  id,
  onChange,
}: {
  basisPoints: number;
  id: string;
  onChange: (basisPoints: number) => void;
}) {
  const [draft, setDraft] = useState(formatPercentageInput(basisPoints));

  useEffect(() => {
    setDraft(formatPercentageInput(basisPoints));
  }, [basisPoints]);

  return (
    <>
      <Input
        id={id}
        inputMode="decimal"
        onBlur={() => {
          const parsed = Number(draft);
          const normalized = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
          const nextBasisPoints = Math.round(normalized * 100);
          setDraft(formatPercentageInput(nextBasisPoints));
          if (nextBasisPoints !== basisPoints) onChange(nextBasisPoints);
        }}
        onChange={(event) => {
          const value = event.target.value;
          if (!/^\d{0,3}(?:\.\d{0,2})?$/.test(value)) return;
          setDraft(value);
          const nextBasisPoints = parsePercentageBasisPoints(value);
          if (nextBasisPoints !== null) onChange(nextBasisPoints);
        }}
        value={draft}
      />
      <span className="text-center text-sm text-muted-foreground">%</span>
    </>
  );
}

function parsePercentageBasisPoints(value: string) {
  if (!value) return null;
  const percentage = Number(value);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) return null;
  const basisPoints = Math.round(percentage * 100);
  return basisPoints <= WORKFLOW_RATIO_SPLIT_TOTAL_BASIS_POINTS ? basisPoints : null;
}

function formatPercentageInput(basisPoints: number) {
  return String(Number((basisPoints / 100).toFixed(2)));
}
