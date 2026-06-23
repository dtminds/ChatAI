import { useCallback, useEffect, useRef, useState } from "react";
import { AgentGenerateGradientButton } from "./agent-generate-gradient-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  agentAiRoleOptions,
  agentGenerateProgressSteps,
  agentIndustryOptions,
  defaultAgentGenerateForm,
  type AgentGenerateForm,
} from "./agent-components/agent-settings.constants";

type GeneratePhase = "form" | "generating";

const generateFieldClassName = "h-10 w-full rounded-[8px] shadow-none";

function RequiredLabel({ children, htmlFor }: { children: string; htmlFor?: string }) {
  return (
    <Label className="text-sm font-medium leading-6 text-foreground" htmlFor={htmlFor}>
      <span aria-hidden className="mr-0.5 text-destructive">
        *
      </span>
      {children}
    </Label>
  );
}

function isGenerateFormValid(form: AgentGenerateForm) {
  return Boolean(form.industry && form.servicesProducts.trim() && form.aiRole);
}

export function AgentSettingsGenerateDialog({
  onComplete,
  onOpenChange,
  open,
}: {
  onComplete?: (form: AgentGenerateForm) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [form, setForm] = useState<AgentGenerateForm>(defaultAgentGenerateForm);
  const [phase, setPhase] = useState<GeneratePhase>("form");
  const [progress, setProgress] = useState<number>(agentGenerateProgressSteps[0].progress);
  const [progressLabel, setProgressLabel] = useState<string>(agentGenerateProgressSteps[0].label);
  const generatingFormRef = useRef(form);
  const onCompleteRef = useRef(onComplete);
  const onOpenChangeRef = useRef(onOpenChange);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onOpenChangeRef.current = onOpenChange;
  }, [onComplete, onOpenChange]);
  const resetDialogState = useCallback(() => {
    setForm(defaultAgentGenerateForm);
    setPhase("form");
    setProgress(agentGenerateProgressSteps[0].progress);
    setProgressLabel(agentGenerateProgressSteps[0].label);
  }, []);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && phase === "generating") {
      return;
    }

    if (!nextOpen) {
      resetDialogState();
    }

    onOpenChange(nextOpen);
  }

  function updateForm<K extends keyof AgentGenerateForm>(key: K, value: AgentGenerateForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleStartGenerate() {
    if (!isGenerateFormValid(form)) {
      return;
    }

    generatingFormRef.current = form;
    setPhase("generating");
    setProgress(agentGenerateProgressSteps[0].progress);
    setProgressLabel(agentGenerateProgressSteps[0].label);
  }

  useEffect(() => {
    if (phase !== "generating") {
      return;
    }

    let stepIndex = 0;
    let cancelled = false;

    const timer = window.setInterval(() => {
      if (cancelled) {
        return;
      }

      stepIndex += 1;

      if (stepIndex >= agentGenerateProgressSteps.length) {
        window.clearInterval(timer);
        onComplete?.(generatingFormRef.current);
        resetDialogState();
        onOpenChange(false);
        return;
      }

      const step = agentGenerateProgressSteps[stepIndex];
      setProgress(step.progress);
      setProgressLabel(step.label);
    }, 900);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [onComplete, onOpenChange, phase]);

  const isGenerating = phase === "generating";

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent
        aria-describedby="agent-settings-generate-description"
        className="gap-0 overflow-hidden rounded-[12px] border border-border p-0 sm:max-w-[520px]"
        closeButtonClassName="text-muted-foreground hover:text-foreground"
        closeButtonDisabled={isGenerating}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="relative overflow-hidden">
          <DialogHeader className="relative space-y-2 px-6 pb-0 pt-6 text-left">
            <DialogTitle className="text-lg font-semibold text-foreground">智能生成</DialogTitle>
            <DialogDescription
              className="text-sm leading-6 text-muted-foreground"
              id="agent-settings-generate-description"
            >
              按实际情况填写表单后，AI 会帮您自动生成 Agent 的配置内容
            </DialogDescription>
          </DialogHeader>

          <div
            className={cn(
              "relative space-y-5 px-6 pb-2 pt-6 transition-opacity",
              isGenerating && "pointer-events-none opacity-40",
            )}
          >
            <div className="space-y-2">
              <RequiredLabel htmlFor="agent-generate-industry">行业</RequiredLabel>
              <Select
                disabled={isGenerating}
                onValueChange={(value) => updateForm("industry", value)}
                value={form.industry}
              >
                <SelectTrigger
                  aria-label="行业"
                  className={generateFieldClassName}
                  id="agent-generate-industry"
                >
                  <SelectValue placeholder="请选择您的行业" />
                </SelectTrigger>
                <SelectContent>
                  {agentIndustryOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <RequiredLabel htmlFor="agent-generate-services">
                请问您为客户提供哪些服务/商品?
              </RequiredLabel>
              <Input
                aria-label="请问您为客户提供哪些服务/商品?"
                className={generateFieldClassName}
                disabled={isGenerating}
                id="agent-generate-services"
                onChange={(event) => updateForm("servicesProducts", event.target.value)}
                placeholder="请输入"
                value={form.servicesProducts}
              />
            </div>

            <div className="space-y-2">
              <RequiredLabel htmlFor="agent-generate-role">您希望 AI 扮演什么样的角色?</RequiredLabel>
              <Select
                disabled={isGenerating}
                onValueChange={(value) => updateForm("aiRole", value)}
                value={form.aiRole}
              >
                <SelectTrigger
                  aria-label="您希望 AI 扮演什么样的角色?"
                  className={generateFieldClassName}
                  id="agent-generate-role"
                >
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  {agentAiRoleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isGenerating ? (
            <div className="absolute inset-x-6 top-[calc(50%-12px)] z-10 rounded-[12px] border border-border bg-background/95 p-5 shadow-lg backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">生成进度</span>
                <span className="text-muted-foreground">{progress}%</span>
              </div>
              <Progress aria-label="生成进度" className="h-2 bg-primary/15" value={progress} />
              <p className="mt-3 text-sm text-muted-foreground">{progressLabel}</p>
            </div>
          ) : null}

          <DialogFooter className="relative px-6 pb-6 pt-8">
            <DialogClose asChild>
              <Button
                className="h-10 rounded-[8px] shadow-none"
                disabled={isGenerating}
                type="button"
                variant="outline"
              >
                取消
              </Button>
            </DialogClose>
            <AgentGenerateGradientButton
              className="min-w-[112px]"
              disabled={isGenerating || !isGenerateFormValid(form)}
              onClick={handleStartGenerate}
            >
              开始生成
            </AgentGenerateGradientButton>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
