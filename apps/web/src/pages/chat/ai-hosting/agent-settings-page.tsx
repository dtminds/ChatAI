import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AiHostingAgentDetail,
  AiHostingAgentPromptConfig,
  AiHostingModel,
} from "@chatai/contracts";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AiChat02Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowLeft02Icon,
  Image01Icon,
  SentIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AgentConditionalLogicField } from "./agent-conditional-logic-field";
import { AgentGenerateGradientButton } from "./agent-generate-gradient-button";
import { AgentSettingsDraftBanner } from "./agent-settings-draft-banner";
import { AgentSettingsGenerateDialog } from "./agent-settings-generate-dialog";
import { AgentSettingsPublishDialog } from "./agent-settings-publish-dialog";
import { AgentSettingsRestoreDialog } from "./agent-settings-restore-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isRequestError } from "@/lib/request";
import { cn } from "@/lib/utils";
import {
  createAiHostingAgent,
  getAiHostingAgent,
  listAiHostingModels,
  publishAiHostingAgent,
  restoreAiHostingAgent,
  updateAiHostingAgent,
} from "./agent-service";
import {
  agentModelOptions,
  agentNameMaxLength,
  agentPreviewSeedMessages,
  agentReplyLengthOptions,
  agentSettingsFieldHints,
  agentToneStyleOptions,
  defaultAgentSettingsForm,
  type AgentReplyLength,
  type AgentSettingsForm,
  type AgentToneStyle,
} from "./agent-settings.constants";
import { AgentModelBadge } from "./agent-model-badge";
import { AiHostingLayout } from "./ai-hosting-layout";
import { aiHostingSettingsModuleSurface } from "./ai-hosting-palette";

type PreviewMessage = {
  content: string;
  id: string;
  role: "agent" | "customer";
};

type ModelOption = {
  id: string;
  label: string;
  model: string;
};

const agentSettingsModuleSurfaceClassName = "rounded-[12px] border border-border bg-card shadow-xs";

const agentSettingsModuleSurfaceStyle = {
  background: aiHostingSettingsModuleSurface.background,
} as const;

export function AgentSettingsPage() {
  const navigate = useNavigate();
  const { agentId } = useParams();
  const isEditing = Boolean(agentId);
  const [form, setForm] = useState<AgentSettingsForm>(defaultAgentSettingsForm);
  const [models, setModels] = useState<AiHostingModel[]>([]);
  const [agentDetail, setAgentDetail] = useState<AiHostingAgentDetail | null>(null);
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>(agentPreviewSeedMessages);
  const [previewInput, setPreviewInput] = useState("");
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const hasUnpublishedDraft = Boolean(agentDetail?.hasUnpublishedChanges);
  const hasLocalPublishChanges = Boolean(
    agentDetail && hasModelOrPromptChanges(form, agentDetail),
  );
  const canPublish = !isEditing || hasUnpublishedDraft || hasLocalPublishChanges;
  const modelOptions = useMemo<ModelOption[]>(
    () =>
      models.length > 0
        ? models.map((model) => ({
          id: model.id,
          label: model.label,
          model: model.model,
        }))
        : agentModelOptions.map((model) => ({
          id: model.value,
          label: model.label,
          model: model.model,
        })),
    [models],
  );
  const selectedModel = modelOptions.find((option) => option.id === form.model);

  const previewTitle = form.name.trim() || "美妆小助手";

  useEffect(() => {
    let ignore = false;

    async function loadInitialData() {
      setLoading(true);
      setErrorMessage("");

      try {
        const [modelsResponse, detailResponse] = await Promise.all([
          listAiHostingModels(),
          agentId ? getAiHostingAgent(agentId) : Promise.resolve(null),
        ]);

        if (ignore) {
          return;
        }

        setModels(modelsResponse.models);

        if (detailResponse) {
          setAgentDetail(detailResponse);
          setForm(mapAgentDetailToForm(detailResponse));
        } else if (modelsResponse.models[0]) {
          setForm((current) => ({ ...current, model: modelsResponse.models[0].id }));
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(isRequestError(error) ? error.message : "Agent设置加载失败");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadInitialData();

    return () => {
      ignore = true;
    };
  }, [agentId]);

  function updateForm<K extends keyof AgentSettingsForm>(key: K, value: AgentSettingsForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    const payload = buildSavePayload(form);

    if (!payload) {
      setErrorMessage("请填写Agent名称并选择大模型");
      return null;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const saved = agentId
        ? await updateAiHostingAgent(agentId, payload)
        : await createAiHostingAgent(payload);

      setAgentDetail(saved);
      setForm(mapAgentDetailToForm(saved));

      if (!agentId) {
        navigate(`/chat/ai-hosting/agents/${saved.id}`, { replace: true });
      }

      return saved;
    } catch (error) {
      setErrorMessage(isRequestError(error) ? error.message : "保存Agent失败");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish() {
    const saved = await handleSave();

    if (!saved) {
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const published = await publishAiHostingAgent(saved.id);
      setAgentDetail(published);
      setForm(mapAgentDetailToForm(published));
      setPublishDialogOpen(false);
    } catch (error) {
      setErrorMessage(isRequestError(error) ? error.message : "发布Agent失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRestore() {
    if (!agentId) {
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const restored = await restoreAiHostingAgent(agentId);
      setAgentDetail(restored);
      setForm(mapAgentDetailToForm(restored));
      setRestoreDialogOpen(false);
    } catch (error) {
      setErrorMessage(isRequestError(error) ? error.message : "还原正式版失败");
    } finally {
      setSubmitting(false);
    }
  }

  function handlePreviewSend() {
    const content = previewInput.trim();

    if (!content) {
      return;
    }

    setPreviewMessages((current) => [
      ...current,
      {
        id: `preview-user-${current.length + 1}`,
        role: "customer",
        content,
      },
      {
        id: `preview-agent-${current.length + 1}`,
        role: "agent",
        content: "你好，请问有什么可以帮您？",
      },
    ]);
    setPreviewInput("");
  }

  return (
    <AiHostingLayout title="Agent设置">
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Button
              aria-label="返回 Agent 管理"
              asChild
              className="size-9 shrink-0 rounded-[8px]"
              size="icon"
              variant="ghost"
            >
              <Link to="/chat/ai-hosting/agents">
                <HugeiconsIcon icon={ArrowLeft02Icon} size={18} strokeWidth={1.8} />
              </Link>
            </Button>
            <h1 className="text-[22px] font-semibold leading-tight text-foreground">Agent设置</h1>
            {hasUnpublishedDraft ? (
              <AgentSettingsDraftBanner onRestoreClick={() => setRestoreDialogOpen(true)} />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={submitting || loading} onClick={handleSave} type="button" variant="outline">
              保存
            </Button>
            <AgentGenerateGradientButton onClick={() => setGenerateDialogOpen(true)}>
              智能生成
            </AgentGenerateGradientButton>
            <Button
              disabled={submitting || loading || (isEditing && !canPublish)}
              onClick={() => setPublishDialogOpen(true)}
              type="button"
            >
              <HugeiconsIcon icon={SentIcon} size={16} strokeWidth={1.8} />
              发布正式版
            </Button>
          </div>
        </header>

        <AgentSettingsRestoreDialog
          onConfirm={handleRestore}
          onOpenChange={setRestoreDialogOpen}
          open={restoreDialogOpen}
        />

        <AgentSettingsPublishDialog
          onConfirm={handlePublish}
          onOpenChange={setPublishDialogOpen}
          open={publishDialogOpen}
        />

        <AgentSettingsGenerateDialog
          onOpenChange={setGenerateDialogOpen}
          open={generateDialogOpen}
        />

        {errorMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <AgentSettingsSection title="基本设置">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="agent-settings-name">Agent名称</Label>
                  <div className="relative">
                    <Input
                      id="agent-settings-name"
                      maxLength={agentNameMaxLength}
                      onChange={(event) => updateForm("name", event.target.value)}
                      placeholder="请输入 Agent 名称"
                      value={form.name}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {form.name.length}/{agentNameMaxLength}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agent-settings-model">大模型</Label>
                  <Select
                    onValueChange={(value) => updateForm("model", value)}
                    value={form.model}
                  >
                    <SelectTrigger className="w-full" id="agent-settings-model">
                      {selectedModel ? (
                        <div className="min-w-0" data-agent-model-trigger-value>
                          <AgentModelBadge
                            label={selectedModel.label}
                            model={selectedModel.model}
                          />
                        </div>
                      ) : (
                        <SelectValue placeholder="请选择大模型" />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions.map((option) => (
                        <SelectItem
                          key={option.id}
                          value={option.id}
                        >
                          <AgentModelBadge
                            label={option.label}
                            model={option.model}
                          />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </AgentSettingsSection>

            <AgentSettingsSection title="回复基调">
              <div className="space-y-5">
                <div className="space-y-3">
                  <Label>语气风格</Label>
                  <OptionChipGroup
                    onChange={(value) => updateForm("toneStyle", value as AgentToneStyle)}
                    options={agentToneStyleOptions.map((option) => ({
                      label: option.emoji ? `${option.emoji} ${option.label}` : option.label,
                      value: option.value,
                    }))}
                    value={form.toneStyle}
                  />
                </div>

                <div className="space-y-3">
                  <Label>回复长度</Label>
                  <OptionChipGroup
                    onChange={(value) => updateForm("replyLength", value as AgentReplyLength)}
                    options={agentReplyLengthOptions}
                    value={form.replyLength}
                  />
                </div>
              </div>
            </AgentSettingsSection>

            <CollapsibleAgentSettingsSection
              description={agentSettingsFieldHints.roleDescription}
              title="角色"
            >
              <Textarea
                aria-label="角色描述"
                className="bg-background"
                onChange={(event) => updateForm("roleDescription", event.target.value)}
                placeholder="请输入角色描述"
                value={form.roleDescription}
              />
            </CollapsibleAgentSettingsSection>

            <CollapsibleAgentSettingsSection
              description={agentSettingsFieldHints.communicationStyle}
              title="沟通风格"
            >
              <Textarea
                aria-label="沟通风格"
                className="bg-background"
                onChange={(event) => updateForm("communicationStyle", event.target.value)}
                placeholder="请输入沟通风格描述"
                value={form.communicationStyle}
              />
            </CollapsibleAgentSettingsSection>

            <CollapsibleAgentSettingsSection
              description={agentSettingsFieldHints.conditionalLogic}
              title="条件逻辑"
            >
              <AgentConditionalLogicField
                onChange={(value) => updateForm("conditionalLogic", value)}
                segments={form.conditionalLogic}
              />
            </CollapsibleAgentSettingsSection>

            <CollapsibleAgentSettingsSection
              description={agentSettingsFieldHints.transferToHumanConditions}
              title="转人工条件"
            >
              <Textarea
                aria-label="转人工条件"
                className="bg-background"
                onChange={(event) => updateForm("transferToHumanConditions", event.target.value)}
                placeholder="请输入转人工条件"
                value={form.transferToHumanConditions}
              />
            </CollapsibleAgentSettingsSection>
          </div>

          <AgentPreviewPanel
            inputValue={previewInput}
            messages={previewMessages}
            onInputChange={setPreviewInput}
            onSend={handlePreviewSend}
            title={previewTitle}
          />
        </div>
      </div>
    </AiHostingLayout>
  );
}

function AgentSettingsSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section
      className={cn(agentSettingsModuleSurfaceClassName, "p-5")}
      style={agentSettingsModuleSurfaceStyle}
    >
      <div className="mb-4 space-y-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function CollapsibleAgentSettingsSection({
  children,
  defaultOpen = true,
  description,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  description?: string;
  title: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionId = `agent-settings-section-${title}`;

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <section
        className={cn(agentSettingsModuleSurfaceClassName, "p-5")}
        style={agentSettingsModuleSurfaceStyle}
      >
        <CollapsibleTrigger asChild>
          <button
            aria-controls={sectionId}
            aria-expanded={open}
            aria-label={`${title}设置`}
            className="flex w-full items-start justify-between gap-4 text-left outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
            type="button"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
              {description ? (
                <p className="text-sm leading-6 text-muted-foreground">{description}</p>
              ) : null}
            </div>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/70 text-muted-foreground">
              <HugeiconsIcon
                icon={open ? ArrowDown01Icon : ArrowLeft01Icon}
                size={16}
                strokeWidth={1.8}
              />
            </span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-4" id={sectionId}>
          {children}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function OptionChipGroup({
  onChange,
  options,
  value,
}: {
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            className={cn(
              "inline-flex h-9 items-center rounded-[8px] border px-3 text-sm transition-colors",
              isActive
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-background text-foreground hover:bg-muted/40",
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function AgentPreviewPanel({
  inputValue,
  messages,
  onInputChange,
  onSend,
  title,
}: {
  inputValue: string;
  messages: PreviewMessage[];
  onInputChange: (value: string) => void;
  onSend: () => void;
  title: string;
}) {
  const visibleMessages = useMemo(() => messages, [messages]);

  return (
    <aside className="xl:sticky xl:top-0">
      <section
        aria-label="Agent 模拟测试"
        className={cn(
          agentSettingsModuleSurfaceClassName,
          "flex h-[640px] flex-col overflow-hidden",
        )}
        style={agentSettingsModuleSurfaceStyle}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-background text-primary shadow-xs">
              <HugeiconsIcon icon={AiChat02Icon} size={16} strokeWidth={1.8} />
            </span>
            <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
          </div>
          <span className="shrink-0 rounded-[6px] bg-background px-2 py-1 text-xs text-muted-foreground">
            模拟测试
          </span>
        </header>

        <div className="flex min-h-0 flex-1 flex-col bg-background">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {visibleMessages.map((message) => (
              <PreviewMessageRow key={message.id} message={message} />
            ))}
          </div>

          <div className="p-4 pt-0">
            <div className="rounded-[8px] border border-border bg-background px-3 py-2.5">
              <Button
                aria-label="上传图片"
                className="mb-1 size-7 rounded-[6px] p-0 text-muted-foreground hover:bg-muted/40"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={Image01Icon} size={18} strokeWidth={1.8} />
              </Button>
              <Textarea
                aria-label="预览输入框"
                className="min-h-20 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    onSend();
                  }
                }}
                placeholder="请输入消息"
                value={inputValue}
              />
            </div>
          </div>
        </div>
      </section>
    </aside>
  );
}

function PreviewMessageRow({ message }: { message: PreviewMessage }) {
  const isAgent = message.role === "agent";

  return (
    <div className={cn("flex items-start gap-2", isAgent ? "justify-start" : "justify-end")}>
      {isAgent ? <PreviewAgentAvatar /> : null}
      <div className="max-w-[78%] rounded-[12px] bg-muted px-3 py-2 text-sm leading-6 text-foreground">
        {message.content}
      </div>
      {!isAgent ? <PreviewCustomerAvatar /> : null}
    </div>
  );
}

function PreviewAgentAvatar() {
  return (
    <Avatar className="size-9 shrink-0 rounded-[8px]">
      <AvatarFallback className="rounded-[8px] bg-emerald-500 text-white">
        <HugeiconsIcon icon={AiChat02Icon} size={16} strokeWidth={1.8} />
      </AvatarFallback>
    </Avatar>
  );
}

function PreviewCustomerAvatar() {
  return (
    <Avatar className="size-9 shrink-0 rounded-[8px]">
      <AvatarFallback className="rounded-[8px] bg-secondary text-sm text-secondary-foreground">
        客
      </AvatarFallback>
    </Avatar>
  );
}

function mapAgentDetailToForm(agent: AiHostingAgentDetail): AgentSettingsForm {
  return {
    communicationStyle: agent.promptConfig.style,
    conditionalLogic: parseConditionalLogicSegments(agent.promptConfig.conditionLogic),
    model: agent.modelId,
    name: agent.name,
    replyLength: normalizeReplyLength(agent.promptConfig.keynote.length),
    roleDescription: agent.promptConfig.role,
    toneStyle: normalizeToneStyle(agent.promptConfig.keynote.style[0] ?? agent.promptConfig.style),
    transferToHumanConditions: agent.promptConfig.transferToHuman,
  };
}

function buildSavePayload(form: AgentSettingsForm) {
  const name = form.name.trim();
  const modelId = form.model.trim();

  if (!name || !modelId) {
    return null;
  }

  return {
    modelId,
    name,
    promptConfig: {
      conditionLogic: serializeConditionalLogicSegments(form.conditionalLogic),
      keynote: {
        length: form.replyLength,
        style: [form.toneStyle],
      },
      role: form.roleDescription,
      style: form.communicationStyle,
      transferToHuman: form.transferToHumanConditions,
    } satisfies AiHostingAgentPromptConfig,
  };
}

function hasModelOrPromptChanges(form: AgentSettingsForm, agent: AiHostingAgentDetail) {
  const payload = buildSavePayload(form);

  if (!payload) {
    return false;
  }

  return (
    payload.modelId !== agent.modelId ||
    JSON.stringify(payload.promptConfig) !== JSON.stringify(agent.promptConfig)
  );
}

function serializeConditionalLogicSegments(segments: AgentSettingsForm["conditionalLogic"]) {
  return segments
    .map((segment) =>
      segment.type === "knowledgeBase"
        ? `{{knowledgeBase:${segment.id}}}`
        : segment.value,
    )
    .join("");
}

function parseConditionalLogicSegments(value: string): AgentSettingsForm["conditionalLogic"] {
  if (!value) {
    return [{ type: "text", value: "" }];
  }

  const segments: AgentSettingsForm["conditionalLogic"] = [];
  const tokenPattern = /\{\{knowledgeBase:([^}]+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(value))) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }

    segments.push({ type: "knowledgeBase", id: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    segments.push({ type: "text", value: value.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", value }];
}

function normalizeToneStyle(value: string): AgentToneStyle {
  return agentToneStyleOptions.some((option) => option.value === value)
    ? (value as AgentToneStyle)
    : "亲切自然";
}

function normalizeReplyLength(value: string): AgentReplyLength {
  return agentReplyLengthOptions.some((option) => option.value === value)
    ? (value as AgentReplyLength)
    : "简洁";
}
