import { AGENT_USER_MEMORY_EXTRACTION_INSTRUCTION_MAX_LENGTH } from "@chatai/contracts";
import { AiIdeaIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export const USER_MEMORY_INDUSTRY_TEMPLATES = [
  {
    id: "general-ecommerce",
    label: "通用电商",
    instruction:
      "重点关注客户主动表达的购买对象、使用场景、品类偏好、价格区间、规格要求、服务偏好、营销接受度、明确避雷项，以及近期购买计划。",
  },
  {
    id: "fashion",
    label: "服装鞋包",
    instruction:
      "重点关注客户主动表达的年龄、身高、体重、体型、常穿尺码、版型偏好、颜色偏好、面料要求、穿着场景、价格区间，以及明确不接受的款式或设计。",
  },
  {
    id: "beauty",
    label: "美妆护肤",
    instruction:
      "重点关注客户主动表达的肤质、护肤目标、常用品类、成分偏好与避雷、妆效偏好、色号倾向、使用步骤、价格区间，以及产品使用反馈。",
  },
  {
    id: "food-health",
    label: "食品保健",
    instruction:
      "重点关注客户主动表达的口味、饮食习惯、配料或成分偏好与避雷、食用人群、食用场景、规格与购买周期，以及产品口感和使用反馈。不得推断或记录健康诊断。",
  },
  {
    id: "maternal-child",
    label: "母婴用品",
    instruction:
      "重点关注客户主动表达的使用对象、年龄或成长阶段、喂养与护理习惯、材质和成分要求、尺寸规格、品牌偏好、价格区间，以及明确避雷项。",
  },
  {
    id: "health",
    label: "大健康",
    instruction:
      "重点关注客户主动表达的健康管理目标、生活习惯、饮食与运动偏好、产品剂型与口味、成分避雷、使用反馈和购买周期。不得推断或记录疾病、诊断和病史等敏感信息。",
  },
  {
    id: "home-appliance",
    label: "家居家电",
    instruction:
      "重点关注客户主动表达的家庭成员、居住空间、使用场景、尺寸与功能要求、风格偏好、安装条件、预算区间、品牌倾向，以及售前和售后服务偏好。",
  },
  {
    id: "digital",
    label: "3C 数码",
    instruction:
      "重点关注客户主动表达的设备用途、现有设备与系统、性能和容量要求、兼容性需求、外观偏好、预算区间、换新周期，以及对操作和售后服务的偏好。",
  },
] as const;

export function UserMemoryInstructionDialog({
  open,
  saving,
  value,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  saving: boolean;
  value: string;
  onOpenChange: (open: boolean) => void;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [customEnabled, setCustomEnabled] = useState(Boolean(value.trim()));

  useEffect(() => {
    if (open) {
      setDraft(value);
      setCustomEnabled(Boolean(value.trim()));
    }
  }, [open, value]);

  const normalizedDraft = draft.trim();
  const invalid = customEnabled && !normalizedDraft;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!saving) onOpenChange(nextOpen);
    }}>
      <DialogContent closeButtonDisabled={saving}>
        <DialogHeader>
          <DialogTitle>记忆提炼指引</DialogTitle>
          <DialogDescription>
            告诉 AI 需要重点关注哪些客户信息，留空则按通用规则提炼
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="user-memory-custom-instruction">
            使用自定义指令
          </Label>
          <Switch
            aria-label="使用自定义指令"
            checked={customEnabled}
            disabled={saving}
            id="user-memory-custom-instruction"
            onCheckedChange={(checked) => {
              setCustomEnabled(checked);
              if (!checked) setDraft("");
            }}
          />
        </div>

        <div className="space-y-3">
          <Textarea
            aria-label="提炼指引"
            className="min-h-40 bg-background"
            disabled={saving || !customEnabled}
            id="user-memory-extraction-instruction"
            maxLength={AGENT_USER_MEMORY_EXTRACTION_INSTRUCTION_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="例如：重点关注客户的身高、体重、常穿尺码、面料偏好和穿着场景"
            value={draft}
          />
          <div className="flex items-center justify-between gap-3">
            <IndustryTemplateDropdown
              disabled={saving || !customEnabled}
              onSelect={(instruction) => setDraft(instruction)}
            />
            <span className="text-xs text-muted-foreground">
              {draft.length}/{AGENT_USER_MEMORY_EXTRACTION_INSTRUCTION_MAX_LENGTH}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={saving}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={saving || invalid}
            onClick={() => onSave(normalizedDraft)}
            type="button"
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IndustryTemplateDropdown({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (instruction: string) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex items-center gap-1 text-sm font-normal text-primary outline-none hover:text-primary/80 focus-visible:ring-4 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50"
          disabled={disabled}
          type="button"
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={AiIdeaIcon}
            size={14}
            strokeWidth={1.8}
          />
          查看行业模板
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {USER_MEMORY_INDUSTRY_TEMPLATES.map((template) => (
          <DropdownMenuItem
            key={template.id}
            onSelect={() => onSelect(template.instruction)}
          >
            {template.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
