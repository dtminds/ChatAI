import { useEffect, useState, type FormEvent } from "react";
import { Edit03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  AgentTurnKfClarificationInput,
  ResolveAgentTurnKfClarificationRequest,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppearanceStore } from "@/store/appearance-store";

export function ChatAgentClarificationPrompt({
  disabled = false,
  input,
  onRespond,
  onTerminate,
}: {
  disabled?: boolean;
  input: AgentTurnKfClarificationInput;
  onRespond: (response: ResolveAgentTurnKfClarificationRequest) => void;
  onTerminate: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<
    string | undefined
  >(input.suggestions?.[0]?.id);
  const beamTheme = useAppearanceStore((state) =>
    state.themePreference === "dark" ||
    (state.themePreference === "system" && state.isSystemDarkMode)
      ? "dark"
      : "light",
  );

  useEffect(() => {
    setInstruction("");
    setSelectedSuggestionId(input.suggestions?.[0]?.id);
  }, [input]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;

    const resolvedInstruction = instruction.trim();
    if (resolvedInstruction) {
      onRespond({
        instruction: resolvedInstruction,
        type: "instruction",
      });
      return;
    }

    if (selectedSuggestionId) {
      onRespond({
        suggestionId: selectedSuggestionId,
        type: "suggestion",
      });
    }
  };

  return (
    <form
      aria-label="客服澄清"
      className="chat-agent-clarification-surface chat-composer-surface relative z-20 rounded-[18px] border p-3 text-foreground"
      data-composer-mode="suggestion"
      data-testid="chat-agent-clarification-prompt"
      onSubmit={handleSubmit}
    >
      <div className="relative z-1">
        <p className="text-sm leading-5 font-medium text-foreground">
          {input.question}
        </p>

        {input.suggestions?.length ? (
          <div className="mt-2.5 flex flex-col gap-0.5">
            {input.suggestions.map((suggestion, index) => {
              const isSelected = selectedSuggestionId === suggestion.id;

              return (
                <button
                  aria-label={suggestion.label}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-4 focus-visible:ring-ring/20",
                    isSelected ? "bg-foreground/[0.055]" : "bg-transparent",
                  )}
                  disabled={disabled}
                  key={suggestion.id}
                  onClick={() => {
                    setSelectedSuggestionId(suggestion.id);
                    setInstruction("");
                  }}
                  type="button"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-divider bg-background/40 text-xs text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-5 font-medium text-foreground">
                      {suggestion.label}
                    </span>
                    <span className="block truncate text-xs leading-4 text-muted-foreground">
                      {suggestion.instruction}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        <label
          className={cn(
            "mt-0.5 flex min-h-14 w-full cursor-text items-center gap-2.5 rounded-[10px] px-2.5 py-2 transition-colors",
            selectedSuggestionId ? "bg-transparent" : "bg-foreground/[0.055]",
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-divider bg-background/40 text-muted-foreground">
            <HugeiconsIcon
              aria-hidden="true"
              icon={Edit03Icon}
              size={14}
              strokeWidth={1.8}
            />
          </span>
          <input
            aria-label="告诉 AI 另一种处理方式"
            className="h-5 min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-[13px] leading-5 text-foreground caret-foreground outline-none placeholder:text-foreground/40"
            disabled={disabled}
            onChange={(event) => {
              setInstruction(event.target.value);
              setSelectedSuggestionId(undefined);
            }}
            onFocus={() => setSelectedSuggestionId(undefined)}
            placeholder="其他处理方式"
            type="text"
            value={instruction}
          />
        </label>

        <div className="mt-2 flex items-center justify-end gap-2">
          <Button
            className="h-8 rounded-[8px] px-3 text-xs shadow-none"
            disabled={disabled}
            onClick={onTerminate}
            size="sm"
            type="button"
            variant="ghost"
          >
            终止
          </Button>
          <Button
            className={cn(
              "h-8 rounded-[8px] px-3 text-xs shadow-none",
              beamTheme === "dark"
                ? "bg-white text-neutral-900 hover:bg-white/90 hover:text-neutral-900"
                : "bg-neutral-strong text-neutral-strong-foreground hover:bg-neutral-strong/90 hover:text-neutral-strong-foreground",
            )}
            disabled={
              disabled || (!instruction.trim() && !selectedSuggestionId)
            }
            size="sm"
            type="submit"
            variant="ghost"
          >
            继续
          </Button>
        </div>
      </div>
    </form>
  );
}
