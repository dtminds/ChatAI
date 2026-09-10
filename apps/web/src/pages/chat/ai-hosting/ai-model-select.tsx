import type { AiHostingModel } from "@chatai/contracts";
import { AgentModelBadge } from "./agent-model-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type AiModelSelectProps = {
  ariaInvalid?: boolean;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  models: AiModelSelectOption[];
  onValueChange: (value: string) => void;
  placeholder: string;
  unavailableModel?: { label: string; model: string };
  unavailableModelId?: string;
  value: string;
};

type AiModelSelectOption = Pick<AiHostingModel, "id" | "label" | "model"> & {
  creditMultiplier?: AiHostingModel["creditMultiplier"];
};

export function formatCreditMultiplier(creditMultiplier: number) {
  return `${(creditMultiplier / 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}x`;
}

export function AiModelSelect({
  ariaInvalid,
  ariaLabel,
  className,
  disabled,
  id,
  models,
  onValueChange,
  placeholder,
  unavailableModel,
  unavailableModelId,
  value,
}: AiModelSelectProps) {
  const selectedModel = models.find((model) => model.id === value);

  return (
    <Select disabled={disabled} onValueChange={onValueChange} value={value}>
      <SelectTrigger
        aria-invalid={ariaInvalid || undefined}
        aria-label={ariaLabel}
        className={cn("w-full justify-start text-left [&>svg]:ml-auto [&>svg]:shrink-0", className)}
        id={id}
      >
        {selectedModel ? (
          <div className="mr-auto flex min-w-0 items-center text-left">
            <AgentModelBadge label={selectedModel.label} model={selectedModel.model} />
          </div>
        ) : unavailableModel ? (
          <div className="mr-auto flex min-w-0 items-center text-left">
            <AgentModelBadge label={unavailableModel.label} model={unavailableModel.model} />
          </div>
        ) : value ? (
          <SelectValue placeholder={value} />
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>
      <SelectContent>
        {unavailableModelId && !selectedModel ? (
          <SelectItem disabled value={unavailableModelId}>原模型不可用</SelectItem>
        ) : null}
        {models.map((model) => (
          <SelectItem
            className={model.creditMultiplier === undefined ? undefined : "pr-12"}
            key={model.id}
            value={model.id}
          >
            <ModelOption model={model} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ModelOption({ model }: { model: AiModelSelectOption }) {
  return (
    <span className="flex min-w-0 items-center">
      <AgentModelBadge label={model.label} model={model.model} />
      {model.creditMultiplier === undefined ? null : (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70 tabular-nums">
          {formatCreditMultiplier(model.creditMultiplier)}
        </span>
      )}
    </span>
  );
}
