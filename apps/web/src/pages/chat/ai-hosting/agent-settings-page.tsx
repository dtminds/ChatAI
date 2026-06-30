import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  AiHostingAgentDetail,
  AiHostingAgentPromptConfig,
  AiHostingAgentTestMessage,
  AiHostingAgentTestMessageContent,
  AiHostingAgentTestResponse,
  AiHostingModel,
} from "@chatai/contracts";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AiIdeaIcon,
  AiChat02Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowLeft02Icon,
  Edit02Icon,
  Image01Icon,
  SentIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { AgentConditionalLogicField } from "./agent-components/agent-conditional-logic-field";
import { AgentSettingsPublishDialog } from "./agent-components/agent-settings-publish-dialog";
import { AgentSettingsRestoreDialog } from "./agent-components/agent-settings-restore-dialog";
import { AgentGenerateGradientButton } from "./agent-generate-gradient-button";
import { AgentSettingsGenerateDialog } from "./agent-settings-generate-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { isRequestError } from "@/lib/request";
import { cn } from "@/lib/utils";
import {
  COMPOSER_IMAGE_FILE_ACCEPT,
  isSupportedComposerImageFile,
  MAX_COMPOSER_IMAGE_SEGMENTS,
} from "@/pages/chat/lib/composer-image-files";
import { useAuthStore } from "@/store/auth-store";
import {
  createAiHostingAgent,
  getAiHostingAgent,
  listAiHostingModels,
  publishAiHostingAgent,
  renameAiHostingAgent,
  restoreAiHostingAgent,
  testAiHostingAgent,
  updateAiHostingAgent,
} from "./agent-service";
import { uploadKbImage } from "./api/kb-doc-service";
import {
  agentModelOptions,
  agentLongTextMaxLength,
  agentNameMaxLength,
  agentCommunicationStyleTemplates,
  agentPreviewSeedMessages,
  agentPreviewTestMessageLimit,
  agentReplyLengthOptions,
  agentSettingsFieldHints,
  defaultAgentSettingsForm,
  type AgentReplyLength,
  type AgentSettingsForm,
  type AgentToneStyle,
} from "./agent-components/agent-settings.constants";
import { AgentModelBadge } from "./agent-model-badge";
import { canManageAiHostingAgents } from "./agent-permissions";
import { AiHostingLayout } from "./ai-hosting-layout";
import { aiHostingSettingsModuleSurface } from "./ai-hosting-palette";

type PreviewMessage = {
  content: string;
  id: string;
  imageUrls?: string[];
  pending?: boolean;
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
  const role = useAuthStore((state) => state.subUser?.role);
  const isEditing = Boolean(agentId);
  const [form, setForm] = useState<AgentSettingsForm>(defaultAgentSettingsForm);
  const [models, setModels] = useState<AiHostingModel[]>([]);
  const [agentDetail, setAgentDetail] = useState<AiHostingAgentDetail | null>(null);
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>(agentPreviewSeedMessages);
  const [previewInput, setPreviewInput] = useState("");
  const [previewTesting, setPreviewTesting] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [createdDraftDialogOpen, setCreatedDraftDialogOpen] = useState(false);
  const [createdDraftAgentId, setCreatedDraftAgentId] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const hasUnpublishedDraft = Boolean(agentDetail?.hasUnpublishedChanges);
  const hasPublishedVersion = Boolean(agentDetail?.publishedAt);
  const canManage = canManageAiHostingAgents(role);
  const controlsDisabled = loading || !canManage;
  const hasLocalPublishChanges = Boolean(
    agentDetail && hasModelOrPromptChanges(form, agentDetail),
  );
  const canPublish = hasUnpublishedDraft || hasLocalPublishChanges;
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
  const pageTitle = isEditing ? (agentDetail?.name || form.name || "Agent") : "创建 Agent";

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
          setErrorMessage(isRequestError(error) ? error.message : "Agent 设置加载失败");
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
    if (!canManage) {
      return;
    }

    setForm((current) => ({ ...current, [key]: value }));
  }

  function applyCommunicationStyleTemplate(value: AgentToneStyle) {
    if (!canManage) {
      return;
    }

    const template = agentCommunicationStyleTemplates.find((option) => option.value === value);

    if (!template) {
      return;
    }

    setForm((current) => ({
      ...current,
      communicationStyle: template.description,
      toneStyle: template.value,
    }));
  }

  async function handleSave() {
    if (!canManage) {
      return null;
    }

    if (isEditing && agentId) {
      const payload = buildSettingsSavePayload(form);

      if (!payload) {
        setErrorMessage("请填写 Agent 名称并选择大模型");
        return null;
      }

      setSubmitting(true);
      setErrorMessage("");

      try {
        const saved = await updateAiHostingAgent(agentId, payload);

        setAgentDetail(saved);
        setForm(mapAgentDetailToForm(saved));

        return saved;
      } catch (error) {
        setErrorMessage(isRequestError(error) ? error.message : "保存 Agent 失败");
        return null;
      } finally {
        setSubmitting(false);
      }
    }

    const payload = buildCreatePayload(form);

    if (!payload) {
      setErrorMessage("请填写 Agent 名称并选择大模型");
      return null;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const saved = await createAiHostingAgent(payload);

      setAgentDetail(saved);
      setForm(mapAgentDetailToForm(saved));
      setCreatedDraftAgentId(saved.id);
      setCreatedDraftDialogOpen(true);

      return saved;
    } catch (error) {
      setErrorMessage(isRequestError(error) ? error.message : "保存 Agent 失败");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish() {
    if (!canManage || !agentId) {
      return;
    }

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
      setErrorMessage(isRequestError(error) ? error.message : "发布 Agent 失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublishCreatedDraft() {
    if (!canManage || !createdDraftAgentId) {
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const published = await publishAiHostingAgent(createdDraftAgentId);
      setAgentDetail(published);
      setForm(mapAgentDetailToForm(published));
      setCreatedDraftDialogOpen(false);
      setCreatedDraftAgentId(null);
      navigate(`/chat/ai-hosting/agents/${published.id}`, { replace: true });
    } catch (error) {
      setErrorMessage(isRequestError(error) ? error.message : "发布 Agent 失败");
    } finally {
      setSubmitting(false);
    }
  }

  function handleAcknowledgeCreatedDraft() {
    setCreatedDraftDialogOpen(false);
    setCreatedDraftAgentId(null);
    navigate("/chat/ai-hosting/agents");
  }

  function openRenameDialog() {
    if (!canManage) {
      return;
    }

    setRenameValue(agentDetail?.name ?? form.name);
    setRenameDialogOpen(true);
  }

  async function handleRename() {
    if (!canManage || !agentId) {
      return;
    }

    const name = renameValue.trim();

    if (!name) {
      setErrorMessage("请输入 Agent 名称");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const renamed = await renameAiHostingAgent(agentId, { name });
      setAgentDetail(renamed);
      setForm(mapAgentDetailToForm(renamed));
      setRenameDialogOpen(false);
    } catch (error) {
      setErrorMessage(isRequestError(error) ? error.message : "保存 Agent 名称失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRestore() {
    if (!canManage || !agentId) {
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

  async function handlePreviewSend() {
    const content = previewInput.trim();

    if (!content || previewTesting) {
      return;
    }

    const succeeded = await submitPreviewTest([{ type: "text", text: content }]);

    if (succeeded) {
      setPreviewInput("");
    }
  }

  async function handlePreviewImageSelect(fileList: FileList | File[] | null) {
    if (previewTesting) {
      return;
    }

    const supportedFiles = Array.from(fileList ?? []).filter(isSupportedComposerImageFile);
    const files = supportedFiles.slice(0, MAX_COMPOSER_IMAGE_SEGMENTS);

    if (supportedFiles.length > MAX_COMPOSER_IMAGE_SEGMENTS) {
      toast.warning("单次发送图片限制为5张");
    }

    if (files.length === 0) {
      return;
    }

    try {
      const imageUrls = (
        await Promise.all(
          files.map(async (file) => {
            const uploadResult = await uploadKbImage(file);
            return uploadResult.url;
          }),
        )
      ).filter(Boolean);

      if (imageUrls.length === 0) {
        return;
      }

      await submitPreviewTest(
        imageUrls.map((url) => ({
          type: "image" as const,
          url,
        })),
        { imageUrls },
      );
    } catch (error) {
      toast.error(isRequestError(error) ? error.message : "图片发送失败");
    }
  }

  async function submitPreviewTest(
    userContents: AiHostingAgentTestMessageContent[],
    previewOverrides?: Partial<Pick<PreviewMessage, "content" | "imageUrls">>,
  ): Promise<boolean> {
    const settingsPayload = buildSettingsSavePayload(form);

    if (!settingsPayload) {
      toast.error("请先选择模型");
      return false;
    }

    if (userContents.length === 0 || previewTesting) {
      return false;
    }

    const historyMessages = mapPreviewMessagesToTestMessages(previewMessages);
    const nextUserMessage: AiHostingAgentTestMessage = {
      role: "user",
      contents: userContents,
    };
    const pendingUserMessage = buildPreviewUserMessage(userContents, previewOverrides);
    const nextMessageCount = previewMessages.length + 2;

    setPreviewTesting(true);
    setPreviewMessages((current) => [
      ...current,
      pendingUserMessage,
      {
        id: `preview-agent-pending-${nextMessageCount}`,
        role: "agent",
        content: "",
        pending: true,
      },
    ]);

    try {
      const response = await testAiHostingAgent({
        messages: [...historyMessages, nextUserMessage].slice(-agentPreviewTestMessageLimit),
        modelId: settingsPayload.modelId,
        promptConfig: settingsPayload.promptConfig,
      });

      setPreviewMessages((current) => {
        const withoutPending = current.slice(0, -1);
        return [...withoutPending, ...mapTestResponseToPreviewMessages(response, nextMessageCount)];
      });
      return true;
    } catch (error) {
      setPreviewMessages((current) => current.slice(0, -2));
      toast.error(isRequestError(error) ? error.message : "模拟测试失败");
      return false;
    } finally {
      setPreviewTesting(false);
    }
  }

  function handlePreviewClear() {
    setPreviewMessages(agentPreviewSeedMessages);
    setPreviewInput("");
  }

  return (
    <AiHostingLayout title={pageTitle}>
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              aria-label="返回 Agent 管理"
              asChild
              className="-ml-2 size-9 shrink-0 rounded-[8px]"
              size="icon"
              variant="ghost"
            >
              <Link to="/chat/ai-hosting/agents">
                <HugeiconsIcon icon={ArrowLeft02Icon} size={18} strokeWidth={1.8} />
              </Link>
            </Button>
            <div className="min-w-0 space-y-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-xl font-semibold leading-tight text-foreground">
                  {pageTitle}
                </h1>
                {isEditing && canManage ? (
                  <Button
                    aria-label="编辑 Agent 名称"
                    className="size-6 shrink-0 rounded-[6px] text-muted-foreground"
                    onClick={openRenameDialog}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <HugeiconsIcon icon={Edit02Icon} size={14} strokeWidth={1.8} />
                  </Button>
                ) : null}
              </div>
              {isEditing ? (
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px]">
                  {agentDetail?.updatedAt ? (
                    <span className="rounded-[6px] bg-muted px-1.5 py-0 leading-4 text-muted-foreground">
                      最近一次保存 {formatAgentSaveTime(agentDetail.updatedAt)}
                    </span>
                  ) : null}
                  {hasUnpublishedDraft ? (
                    <AgentSettingsHeaderDraftBadge
                      onRestoreClick={canManage ? () => setRestoreDialogOpen(true) : undefined}
                      published={hasPublishedVersion}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={submitting || loading} onClick={handleSave} type="button" variant="outline">
                {submitting ? <ButtonSpinner label="保存中" /> : null}
                保存
              </Button>
              <AgentGenerateGradientButton onClick={() => setGenerateDialogOpen(true)}>
                智能生成
              </AgentGenerateGradientButton>
              {isEditing ? (
                <Button
                  disabled={submitting || loading || !canPublish}
                  onClick={() => setPublishDialogOpen(true)}
                  type="button"
                >
                  <HugeiconsIcon icon={SentIcon} size={16} strokeWidth={1.8} />
                  发布正式版
                </Button>
              ) : null}
            </div>
          ) : null}
        </header>

        <AgentSettingsRestoreDialog
          disabled={submitting}
          onConfirm={handleRestore}
          onOpenChange={setRestoreDialogOpen}
          open={restoreDialogOpen}
        />

        <AgentSettingsPublishDialog
          disabled={submitting}
          onConfirm={handlePublish}
          onOpenChange={setPublishDialogOpen}
          open={publishDialogOpen}
        />

        <CreatedDraftDialog
          disabled={submitting}
          onAcknowledge={handleAcknowledgeCreatedDraft}
          onPublish={handlePublishCreatedDraft}
          open={createdDraftDialogOpen}
        />

        <RenameAgentDialog
          disabled={submitting}
          name={renameValue}
          onChange={setRenameValue}
          onConfirm={handleRename}
          onOpenChange={setRenameDialogOpen}
          open={renameDialogOpen}
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
        {!canManage ? (
          <p className="rounded-[8px] border border-border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
            当前账号仅可查看 Agent，保存、发布和还原操作需管理员权限
          </p>
        ) : null}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <AgentSettingsSection title="基本设置">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="agent-settings-name">Agent 名称</Label>
                  <div className="relative">
                    <Input
                      disabled={isEditing || controlsDisabled}
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
                    disabled={controlsDisabled}
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

            <CollapsibleAgentSettingsSection
              description={agentSettingsFieldHints.roleDescription}
              title="角色"
            >
              <Textarea
                aria-label="角色描述"
                className="bg-background"
                disabled={controlsDisabled}
                maxLength={agentLongTextMaxLength}
                onChange={(event) => updateForm("roleDescription", event.target.value)}
                placeholder="请输入角色描述"
                value={form.roleDescription}
              />
              <TextCounter maxLength={agentLongTextMaxLength} value={form.roleDescription} />
            </CollapsibleAgentSettingsSection>

            <CollapsibleAgentSettingsSection
              description={
                <>
                  {agentSettingsFieldHints.communicationStyle}
                  {canManage ? (
                    <CommunicationStyleTemplateDropdown onSelect={applyCommunicationStyleTemplate} />
                  ) : null}
                </>
              }
              title="沟通风格"
            >
              <div className="space-y-5">
                <div className="space-y-3">
                  <Label>风格描述</Label>
                  <div className="relative">
                    <Textarea
                      aria-label="沟通风格"
                      className="bg-background"
                      disabled={controlsDisabled}
                      maxLength={agentLongTextMaxLength}
                      onChange={(event) => updateForm("communicationStyle", event.target.value)}
                      placeholder="请输入沟通风格描述"
                      value={form.communicationStyle}
                    />
                    <TextCounter maxLength={agentLongTextMaxLength} value={form.communicationStyle} />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>回复长度</Label>
                  <OptionChipGroup
                    disabled={controlsDisabled}
                    onChange={(value) => updateForm("replyLength", value as AgentReplyLength)}
                    options={agentReplyLengthOptions}
                    value={form.replyLength}
                  />
                </div>
              </div>
            </CollapsibleAgentSettingsSection>

            <CollapsibleAgentSettingsSection
              description={agentSettingsFieldHints.conditionalLogic}
              title="条件逻辑"
            >
              <AgentConditionalLogicField
                disabled={controlsDisabled}
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
                disabled={controlsDisabled}
                maxLength={agentLongTextMaxLength}
                onChange={(event) => updateForm("transferToHumanConditions", event.target.value)}
                placeholder="请输入转人工条件"
                value={form.transferToHumanConditions}
              />
              <TextCounter maxLength={agentLongTextMaxLength} value={form.transferToHumanConditions} />
            </CollapsibleAgentSettingsSection>
          </div>

          <AgentPreviewPanel
            inputValue={previewInput}
            messages={previewMessages}
            onClear={handlePreviewClear}
            onImageSelect={handlePreviewImageSelect}
            onInputChange={setPreviewInput}
            onSend={handlePreviewSend}
            testing={previewTesting}
            title={previewTitle}
          />
        </div>
      </div>
    </AiHostingLayout>
  );
}

function AgentSettingsSection({
  action,
  children,
  description,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section
      className={cn(agentSettingsModuleSurfaceClassName, "p-5")}
      style={agentSettingsModuleSurfaceStyle}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
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
  description?: ReactNode;
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
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {description ? (
              <p className="text-sm leading-6 text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <CollapsibleTrigger asChild>
            <button
              aria-controls={sectionId}
              aria-expanded={open}
              aria-label={`${title}设置`}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/70 text-muted-foreground outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
              type="button"
            >
              <HugeiconsIcon
                icon={open ? ArrowDown01Icon : ArrowLeft01Icon}
                size={16}
                strokeWidth={1.8}
              />
            </button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent className="pt-4" id={sectionId}>
          {children}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function CommunicationStyleTemplateDropdown({
  onSelect,
}: {
  onSelect: (value: AgentToneStyle) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          className="ml-1 inline-flex items-baseline gap-1 align-baseline text-sm font-normal leading-6 text-primary outline-none hover:text-primary/80 focus-visible:ring-4 focus-visible:ring-ring/20"
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          <HugeiconsIcon
            aria-hidden="true"
            className="relative top-[1px]"
            icon={AiIdeaIcon}
            size={14}
            strokeWidth={1.8}
          />
          查看模板
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {agentCommunicationStyleTemplates.map((template) => (
          <DropdownMenuItem
            key={template.value}
            onSelect={() => onSelect(template.value)}
          >
            {template.emoji ? `${template.emoji} ${template.label}` : template.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OptionChipGroup({
  disabled = false,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
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
              disabled && "cursor-not-allowed opacity-60 hover:bg-background",
            )}
            disabled={disabled}
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

function TextCounter({ maxLength, value }: { maxLength: number; value: string }) {
  return (
    <div className="mt-1 text-right text-xs text-muted-foreground">
      {value.length}/{maxLength}
    </div>
  );
}

function AgentPreviewPanel({
  inputValue,
  messages,
  onClear,
  onImageSelect,
  onInputChange,
  onSend,
  testing,
  title,
}: {
  inputValue: string;
  messages: PreviewMessage[];
  onClear: () => void;
  onImageSelect: (files: FileList | File[] | null) => void | Promise<void>;
  onInputChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  testing: boolean;
  title: string;
}) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const visibleMessages = useMemo(() => messages, [messages]);

  const scrollPreviewToBottom = useCallback(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, []);

  useEffect(() => {
    scrollPreviewToBottom();
    window.requestAnimationFrame(() => {
      scrollPreviewToBottom();
      window.requestAnimationFrame(scrollPreviewToBottom);
    });
  }, [scrollPreviewToBottom, testing, visibleMessages]);

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
            <span className="rounded-[6px] bg-background px-2 py-1 text-xs text-muted-foreground">
              模拟测试
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              className="h-auto rounded-[6px] px-2 py-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
              disabled={testing}
              onClick={onClear}
              type="button"
              variant="ghost"
            >
              清空
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col bg-background">
          <div
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
            ref={messageViewportRef}
          >
            {visibleMessages.map((message) => (
              <PreviewMessageRow
                key={message.id}
                message={message}
                onMediaLoad={scrollPreviewToBottom}
              />
            ))}
          </div>

          <div className="p-4 pt-0">
            <div className="rounded-[8px] border border-border bg-background px-3 py-2.5">
              <Button
                aria-label="上传图片"
                className="mb-1 size-7 rounded-[6px] p-0 text-muted-foreground hover:bg-muted/40"
                disabled={testing}
                onClick={() => imageInputRef.current?.click()}
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={Image01Icon} size={18} strokeWidth={1.8} />
              </Button>
              <input
                accept={COMPOSER_IMAGE_FILE_ACCEPT}
                aria-label="选择图片"
                className="sr-only"
                disabled={testing}
                multiple
                onChange={(event) => {
                  void onImageSelect(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
                ref={imageInputRef}
                type="file"
              />
              <Textarea
                aria-label="预览输入框"
                className="min-h-20 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                disabled={testing}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (inputValue.trim() && !testing) {
                      void onSend();
                    }
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

function PreviewMessageRow({
  message,
  onMediaLoad,
}: {
  message: PreviewMessage;
  onMediaLoad?: () => void;
}) {
  const isAgent = message.role === "agent";
  const hasImages = Boolean(message.imageUrls?.length);

  return (
    <div className={cn("flex items-start gap-2", isAgent ? "justify-start" : "justify-end")}>
      {isAgent ? <PreviewAgentAvatar /> : null}
      <div className="max-w-[78%] space-y-2 rounded-[12px] bg-muted px-3 py-2 text-sm leading-6 text-foreground">
        {message.pending ? (
          <div className="flex items-center gap-2 text-muted-foreground" role="status">
            <Spinner aria-hidden="true" size={14} variant="classic" />
            正在加载
          </div>
        ) : (
          <>
            {hasImages ? (
              <div className="space-y-2">
                {message.imageUrls?.map((imageUrl, index) => (
                  <img
                    alt=""
                    className="max-h-44 max-w-full rounded-lg border border-border object-contain"
                    draggable={false}
                    key={`${message.id}-image-${index}`}
                    onLoad={onMediaLoad}
                    src={imageUrl}
                  />
                ))}
              </div>
            ) : null}
            {message.content ? <p>{message.content}</p> : null}
          </>
        )}
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

function AgentSettingsHeaderDraftBadge({
  onRestoreClick,
  published,
}: {
  onRestoreClick?: () => void;
  published: boolean;
}) {
  return (
    <span className="inline-flex items-center rounded-[6px] bg-warning-muted/55 px-1.5 py-0 leading-4 text-warning">
      {published && onRestoreClick ? (
        <>
          有尚未发布的修改，你也可以
          <Button
            className="h-auto px-1 py-0 text-[11px] font-normal text-primary hover:bg-transparent hover:text-primary/80"
            onClick={onRestoreClick}
            type="button"
            variant="ghost"
          >
            还原为正式版
          </Button>
        </>
      ) : (
        "有尚未发布的修改"
      )}
    </span>
  );
}

function formatAgentSaveTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function CreatedDraftDialog({
  disabled,
  onAcknowledge,
  onPublish,
  open,
}: {
  disabled: boolean;
  onAcknowledge: () => void;
  onPublish: () => void;
  open: boolean;
}) {
  return (
    <Dialog open={open}>
      <DialogContent
        aria-describedby="agent-created-draft-description"
        className="gap-0 p-0 sm:max-w-[420px]"
        closeButtonVisible={false}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-2 px-6 pt-6 text-left">
          <DialogTitle>保存成功</DialogTitle>
          <DialogDescription id="agent-created-draft-description">
            保存成功，尚未发布
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="px-6 pb-6 pt-8">
          <Button disabled={disabled} onClick={onAcknowledge} type="button" variant="outline">
            知道了
          </Button>
          <Button disabled={disabled} onClick={onPublish} type="button">
            {disabled ? <ButtonSpinner label="发布中" /> : null}
            立即发布
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameAgentDialog({
  disabled,
  name,
  onChange,
  onConfirm,
  onOpenChange,
  open,
}: {
  disabled: boolean;
  name: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby="agent-rename-description"
        className="gap-0 p-0 sm:max-w-[420px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-2 px-6 pt-6 text-left">
          <DialogTitle>编辑 Agent 名称</DialogTitle>
          <DialogDescription className="sr-only" id="agent-rename-description">
            修改 Agent 名称
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 px-6 pt-5">
          <Label htmlFor="agent-rename-name">Agent 名称</Label>
          <div className="relative">
            <Input
              disabled={disabled}
              id="agent-rename-name"
              maxLength={agentNameMaxLength}
              onChange={(event) => onChange(event.target.value)}
              placeholder="请输入 Agent 名称"
              value={name}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {name.length}/{agentNameMaxLength}
            </span>
          </div>
        </div>

        <DialogFooter className="px-6 pb-6 pt-8">
          <DialogClose asChild>
            <Button disabled={disabled} type="button" variant="outline">
              取消
            </Button>
          </DialogClose>
          <Button disabled={disabled} onClick={onConfirm} type="button">
            {disabled ? <ButtonSpinner label="保存中" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ButtonSpinner({ label }: { label: string }) {
  return (
    <>
      <Spinner aria-hidden="true" className="text-current" size={14} variant="classic" />
      <span className="sr-only">{label}</span>
    </>
  );
}

function mapAgentDetailToForm(agent: AiHostingAgentDetail): AgentSettingsForm {
  return {
    communicationStyle: agent.promptConfig.replyStyle.styleInstruction,
    conditionalLogic: parseConditionalLogicSegments(agent.promptConfig.conditionLogic),
    model: agent.modelId,
    name: agent.name,
    replyLength: normalizeReplyLength(agent.promptConfig.replyStyle.length),
    roleDescription: agent.promptConfig.role,
    toneStyle: normalizeToneStyle(agent.promptConfig.replyStyle.styleInstruction),
    transferToHumanConditions: agent.promptConfig.handoffRules,
  };
}

function buildCreatePayload(form: AgentSettingsForm) {
  const settingsPayload = buildSettingsSavePayload(form);
  const name = form.name.trim();

  if (!settingsPayload || !name) {
    return null;
  }

  return {
    ...settingsPayload,
    name,
  };
}

function buildSettingsSavePayload(form: AgentSettingsForm) {
  const modelId = form.model.trim();

  if (!modelId) {
    return null;
  }

  return {
    modelId,
    promptConfig: {
      availableKbIds: collectAvailableKnowledgeBaseIds(form.conditionalLogic),
      conditionLogic: serializeConditionalLogicSegments(form.conditionalLogic),
      handoffRules: form.transferToHumanConditions,
      replyStyle: {
        length: form.replyLength,
        styleInstruction: form.communicationStyle || form.toneStyle,
      },
      role: form.roleDescription,
    } satisfies AiHostingAgentPromptConfig,
  };
}

function hasModelOrPromptChanges(form: AgentSettingsForm, agent: AiHostingAgentDetail) {
  const payload = buildSettingsSavePayload(form);

  if (!payload) {
    return false;
  }

  return (
    payload.modelId !== agent.modelId ||
    stableStringify(payload.promptConfig) !== stableStringify(agent.promptConfig)
  );
}

function stableStringify(value: unknown) {
  return JSON.stringify(sortObjectKeys(value));
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, sortObjectKeys(nestedValue)]),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function serializeConditionalLogicSegments(segments: AgentSettingsForm["conditionalLogic"]) {
  return segments
    .map((segment) =>
      segment.type === "knowledgeBase"
        ? `<resource type="knowledge_base" kbId="${escapeResourceAttribute(
            segment.id,
          )}" name="${escapeResourceAttribute(segment.name ?? segment.id)}" />`
        : segment.value,
    )
    .join("");
}

function parseConditionalLogicSegments(value: string): AgentSettingsForm["conditionalLogic"] {
  if (!value) {
    return [{ type: "text", value: "" }];
  }

  const segments: AgentSettingsForm["conditionalLogic"] = [];
  const tokenPattern = /<resource\s+type="knowledge_base"\s+kbId="([^"]+)"\s+name="([^"]*)"\s*\/>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(value))) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }

    const id = unescapeResourceAttribute(match[1] ?? "");
    const name = unescapeResourceAttribute(match[2] ?? "");

    segments.push({
      id,
      name: name || undefined,
      type: "knowledgeBase",
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    segments.push({ type: "text", value: value.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", value }];
}

function collectAvailableKnowledgeBaseIds(segments: AgentSettingsForm["conditionalLogic"]) {
  const ids = segments
    .filter((segment): segment is Extract<AgentSettingsForm["conditionalLogic"][number], { type: "knowledgeBase" }> =>
      segment.type === "knowledgeBase",
    )
    .map((segment) => Number(segment.id))
    .filter((id) => Number.isSafeInteger(id) && id > 0);

  return Array.from(new Set(ids));
}

function escapeResourceAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function unescapeResourceAttribute(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function normalizeToneStyle(value: string): AgentToneStyle {
  return agentCommunicationStyleTemplates.some((option) => option.value === value)
    ? (value as AgentToneStyle)
    : "亲切自然";
}

function normalizeReplyLength(value: string): AgentReplyLength {
  return agentReplyLengthOptions.some((option) => option.value === value)
    ? (value as AgentReplyLength)
    : "简洁";
}

function mapPreviewMessagesToTestMessages(messages: PreviewMessage[]): AiHostingAgentTestMessage[] {
  return messages.flatMap((message) => {
    if (message.pending) {
      return [];
    }

    const contents = buildTestMessageContents(message);
    if (contents.length === 0) {
      return [];
    }

    return [
      {
        role: message.role === "customer" ? "user" : "assistant",
        contents,
      },
    ];
  });
}

function buildTestMessageContents(message: PreviewMessage): AiHostingAgentTestMessageContent[] {
  if (message.role === "agent") {
    const text = message.content.trim();
    return text ? [{ type: "text", text }] : [];
  }

  const contents: AiHostingAgentTestMessageContent[] = [];

  for (const url of message.imageUrls ?? []) {
    contents.push({ type: "image", url });
  }

  const text = message.content.trim();
  if (text) {
    contents.push({ type: "text", text });
  }

  return contents;
}

function buildPreviewUserMessage(
  userContents: AiHostingAgentTestMessageContent[],
  previewOverrides?: Partial<Pick<PreviewMessage, "content" | "imageUrls">>,
): PreviewMessage {
  const text = previewOverrides?.content ?? readTestTextContent(userContents);
  const imageUrls =
    previewOverrides?.imageUrls ??
    userContents.flatMap((content) => (content.type === "image" && content.url ? [content.url] : []));

  return {
    id: `preview-user-${Date.now()}`,
    role: "customer",
    content: text,
    ...(imageUrls.length > 0 ? { imageUrls } : {}),
  };
}

function readTestTextContent(contents: AiHostingAgentTestMessageContent[]) {
  return contents
    .flatMap((content) => (content.type === "text" && content.text ? [content.text] : []))
    .join("\n")
    .trim();
}

function mapTestResponseToPreviewMessages(
  response: AiHostingAgentTestResponse,
  messageIndex: number,
): PreviewMessage[] {
  return response.reply.flatMap((item, index) => {
    const id = `preview-agent-${messageIndex + index}`;
    const textContent = normalizePreviewReplyText(item);

    if (item.type === "text" && textContent) {
      return [
        {
          id,
          role: "agent" as const,
          content: textContent,
        },
      ];
    }

    if (item.type === "image" && item.content) {
      return [
        {
          id,
          role: "agent" as const,
          content: "",
          imageUrls: [item.content],
        },
      ];
    }

    return [];
  });
}

function normalizePreviewReplyText(item: AiHostingAgentTestResponse["reply"][number]) {
  if (item.type !== "text") {
    return "";
  }

  const content = item.content.trim();
  if (!content.startsWith("{")) {
    return content;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "reply" in parsed &&
      Array.isArray((parsed as { reply?: unknown }).reply)
    ) {
      return (parsed as AiHostingAgentTestResponse).reply
        .flatMap((replyItem) => (replyItem.type === "text" ? [replyItem.content.trim()] : []))
        .filter(Boolean)
        .join("\n");
    }
  } catch {
    return content;
  }

  return content;
}
