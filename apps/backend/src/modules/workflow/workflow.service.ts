import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  getWorkflowCustomFieldVariableIds,
  WORKFLOW_DESCRIPTION_MAX_LENGTH,
  WORKFLOW_NAME_MAX_LENGTH,
} from "@chatai/contracts";
import type {
  CustomFieldItem,
  WorkflowCreateRequest,
  WorkflowDefinition,
  WorkflowDefinitionListItem,
  WorkflowDefinitionListPage,
  WorkflowDefinitionListStatus,
  WorkflowDirectEntryEndpointResponse,
  WorkflowDraft,
  WorkflowMetadataUpdateRequest,
  WorkflowPublishRequest,
  WorkflowPublishReview,
  WorkflowPublishReviewChangeSummary,
  WorkflowReviewApproveRequest,
  WorkflowReviewRejectRequest,
  WorkflowReviewSubmitRequest,
  WorkflowPublishResult,
  WorkflowRestoreRequest,
  WorkflowRevision,
  WorkflowSaveDraftRequest,
  WorkflowStartConfig,
  WorkflowStartDraftConfig,
  WorkflowSurface,
  WorkflowType,
  WorkflowTypeEntitlementResult,
  WorkflowLlmTestAttempt,
  WorkflowAiIntentTestAttemptCreateRequest,
  WorkflowLlmTestAttemptCreateRequest,
  WorkflowJsonObject,
  WorkflowLlmInputParameter,
  WorkflowOutputValueType,
  WorkflowVariableSelector,
  WorkflowTemplateApplicationRequest,
  WorkflowTemplateConversionRequest,
  WorkflowTemplateConfigurationItem,
  WorkflowTemplateDetail,
  WorkflowTemplateDraftUpdateRequest,
  WorkflowTemplateListPage,
} from "@chatai/contracts";
import type { WorkflowNodeKind } from "@chatai/contracts";
import { isWorkflowTemplateTagId, normalizeWorkflowTemplateTagIds } from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import {
  extractWorkflowNodeDraftConfig,
  getUnknownWorkflowNodeDraftDataKeys,
  getWorkflowCapabilityProfile,
  getEnabledWorkflowTypes,
  getWorkflowSurfaceTypes,
  getWorkflowNodeContract,
  getWorkflowNodeOutputContracts,
  isWorkflowAiIntentExecutionConfigComplete,
  isWorkflowLlmExecutionConfigComplete,
  isWorkflowNodeDraftConfig,
  WorkflowMessageSchema,
  WorkflowStartConfigSchema,
  WorkflowStartDraftConfigSchema,
  WorkflowMessagesV1Schema,
  WorkflowDirectEntryEndpointKeySchema,
  WORKFLOW_LLM_TEST_INPUT_MAX_BYTES,
} from "@chatai/contracts";
import {
  compileWorkflowDraft,
  validateWorkflowGraph,
  evaluateWorkflowProductionAvailability,
  getWorkflowTriggerBindings,
  getWorkflowGuaranteedUpstreamNodeIds,
  isWorkflowOutputAvailableOnSourceOutlets,
  getWorkflowNodeExecutionConfigError,
  projectWorkflowNodeExecutionConfig,
  normalizeWorkflowDraft,
  validateWorkflowTypePolicy,
  WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS,
  WorkflowCapabilityExecutionError,
  WorkflowCompilationError,
  type WorkflowTriggerBindingSpec,
} from "@chatai/workflow-engine";
import {
  decideWorkflowEntitlement,
  UnavailableWorkflowEntitlementPort,
  WorkflowEntitlementUnavailableError,
  createWorkflowLlmInferenceRequest,
  createWorkflowAiIntentInferenceRequest,
  assertWorkflowRuntimeValue,
  type WorkflowLlmTestAttemptRecord,
  type WorkflowLlmTestAttemptRepository,
  type WorkflowEntitlementDecision,
  type WorkflowEntitlementPort,
} from "@chatai/workflow-runtime";
import {
  AppError,
  BadGatewayError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
} from "../../shared/errors.js";
import { noopLogger, type AppLogger, type RequestAwareLogger } from "../../shared/logger.js";
import type {
  WorkflowDefinitionListRecord,
  WorkflowDefinitionRecord,
  WorkflowMutationResult,
  WorkflowPublishReviewRecord,
  WorkflowRepository,
  WorkflowRevisionRecord,
} from "./workflow-repository-types.js";
import {
  EmptyWorkflowManagedAccountReader,
  type WorkflowManagedAccountReader,
  type WorkflowManagedAccountSummary,
} from "./workflow-managed-account-reader.js";
import {
  EmptyWorkflowMetricReader,
  type WorkflowMetricReader,
  type WorkflowMetricSummary,
} from "./workflow-metric-reader.js";
import {
  EmptyWorkflowWeComMemberReader,
  type WorkflowWeComMemberReader,
  type WorkflowWeComMemberSummary,
} from "./workflow-wecom-member-reader.js";
import {
  UnavailableWorkflowSourceIdentityResolver,
  type WorkflowSourceIdentityResolver,
} from "./workflow-source-identity.js";
import {
  EmptyWorkflowSubUserReader,
  type WorkflowSubUserReader,
} from "./workflow-sub-user-reader.js";
import {
  UnavailableWorkflowDirectEntryEndpointPort,
  type WorkflowDirectEntryEndpointPort,
} from "./direct-entry-endpoint-port.js";
import type { WorkflowTemplateRepository } from "./workflow-template-repository-types.js";
import { canManageWorkflowTemplates } from "../auth/permissions.js";

export type WorkflowOperatorScope = {
  roles: string[];
  subUserId: string;
  surface?: WorkflowSurface;
  uid: number;
};

export type WorkflowServiceOptions = {
  clock?: () => Date;
  customFieldReader?: WorkflowCustomFieldReader;
  directEntryEndpointPort?: WorkflowDirectEntryEndpointPort;
  entitlementPort?: WorkflowEntitlementPort;
  sourceIdentityResolver?: WorkflowSourceIdentityResolver;
  subUserReader?: WorkflowSubUserReader;
  llmTestAttemptRepository?: WorkflowLlmTestAttemptRepository;
  llmTestTimeoutMs?: number;
  llmTestTtlMs?: number;
  managedAccountReader?: WorkflowManagedAccountReader;
  metricReader?: WorkflowMetricReader;
  logger?: AppLogger | RequestAwareLogger;
  wecomMemberReader?: WorkflowWeComMemberReader;
  templateRepository?: WorkflowTemplateRepository;
};

export type WorkflowCustomFieldReader = {
  listActiveFields(uid: number): Promise<readonly CustomFieldItem[]>;
};

const WORKFLOW_TEMPLATE_TENANT_RESOURCE_KEYS = new Set([
  "accountId", "accountIds", "managedAccountId", "managedAccountIds", "seatId", "seatIds",
  "memberId", "memberIds", "workUserId", "workUserIds", "friendAddWayId", "friendAddWayIds",
  "sourceId", "sourceIds", "addWayKey", "groupId", "tagId", "tagIds", "audienceId", "audienceIds",
  "audienceGroupId", "audienceGroupIds", "customerFieldId", "customerFieldIds", "fieldId", "fieldIds",
  "materialId", "materialIds", "materialCollectionId", "materialCollectionIds", "msgInfoId", "msgid",
  "modelId", "modelIds", "model",
]);

export class WorkflowService {
  private static readonly ENTITLEMENT_REFRESH_MIN_INTERVAL_MS = 30_000;
  private static readonly ENTITLEMENT_REFRESH_MAX_ENTRIES = 10_000;
  private readonly clock: () => Date;
  private readonly customFieldReader: WorkflowCustomFieldReader;
  private readonly directEntryEndpointPort: WorkflowDirectEntryEndpointPort;
  private readonly entitlementPort: WorkflowEntitlementPort;
  private readonly sourceIdentityResolver: WorkflowSourceIdentityResolver;
  private readonly subUserReader: WorkflowSubUserReader;
  private readonly llmTestAttemptRepository?: WorkflowLlmTestAttemptRepository;
  private readonly llmTestTimeoutMs: number;
  private readonly llmTestTtlMs: number;
  private readonly managedAccountReader: WorkflowManagedAccountReader;
  private readonly metricReader: WorkflowMetricReader;
  private readonly logger: AppLogger | RequestAwareLogger;
  private readonly wecomMemberReader: WorkflowWeComMemberReader;
  private readonly templateRepository?: WorkflowTemplateRepository;
  private readonly entitlementRefreshes = new Map<string, {
    attemptedAt: number;
    outcome: "denied" | "unavailable";
  }>();

  constructor(
    private readonly repository: WorkflowRepository,
    options: WorkflowServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.customFieldReader = options.customFieldReader ?? {
      listActiveFields: async () => {
        throw new ServiceUnavailableError(
          "WORKFLOW_CUSTOM_FIELD_RESOURCE_UNAVAILABLE",
          "暂时无法校验客户自定义属性，请稍后重试",
        );
      },
    };
    this.directEntryEndpointPort = options.directEntryEndpointPort
      ?? new UnavailableWorkflowDirectEntryEndpointPort();
    this.entitlementPort = options.entitlementPort
      ?? new UnavailableWorkflowEntitlementPort();
    this.sourceIdentityResolver = options.sourceIdentityResolver
      ?? new UnavailableWorkflowSourceIdentityResolver();
    this.subUserReader = options.subUserReader ?? new EmptyWorkflowSubUserReader();
    this.llmTestAttemptRepository = options.llmTestAttemptRepository;
    this.llmTestTimeoutMs = options.llmTestTimeoutMs ?? 600_000;
    this.llmTestTtlMs = options.llmTestTtlMs ?? 86_400_000;
    this.managedAccountReader = options.managedAccountReader
      ?? new EmptyWorkflowManagedAccountReader();
    this.metricReader = options.metricReader ?? new EmptyWorkflowMetricReader();
    this.logger = options.logger ?? noopLogger;
    this.wecomMemberReader = options.wecomMemberReader ?? new EmptyWorkflowWeComMemberReader();
    this.templateRepository = options.templateRepository;
  }

  async getDirectEntryEndpoint(
    scope: WorkflowOperatorScope,
    workflowId: string,
  ): Promise<WorkflowDirectEntryEndpointResponse> {
    assertWorkflowAccess(scope);
    const definition = await this.requireVisibleDefinition(scope, workflowId);
    const draft = normalizeWorkflowDraft(definition.draft);
    const entryNode = draft.nodes.find(node => node.data.kind === "start");
    const entryConfig = entryNode
      ? extractWorkflowNodeDraftConfig("start", entryNode.data)
      : null;
    if (definition.workflowType !== "chatai_sop"
      || !entryConfig
      || !Value.Check(WorkflowStartDraftConfigSchema, entryConfig)
      || entryConfig.entryMode !== "direct-push") {
      throw new BadRequestError("WORKFLOW_DIRECT_ENTRY_UNAVAILABLE", "工作流尚未发布外部推送入口");
    }
    const endpointKey = await this.directEntryEndpointPort.getEndpointKey({
      uid: scope.uid,
      workflowId,
    });
    if (!Value.Check(WorkflowDirectEntryEndpointKeySchema, endpointKey)) {
      throw new BadGatewayError(
        "WORKFLOW_DIRECT_ENTRY_ENDPOINT_INVALID",
        "外部推送地址生成失败",
      );
    }
    return {
      endpointKey,
    };
  }

  async createLlmTestAttempt(
    scope: WorkflowOperatorScope,
    workflowId: string,
    nodeId: string,
    input: WorkflowLlmTestAttemptCreateRequest,
  ): Promise<WorkflowLlmTestAttempt> {
    assertWorkflowAccess(scope);
    const repository = this.requireLlmTestAttemptRepository();
    const definition = await this.requireVisibleDefinition(scope, workflowId);
    await this.requireEntitlement(scope.uid, definition.workflowType);
    if (definition.draftVersion !== input.expectedDraftVersion) throw conflictError();
    const draft = normalizeWorkflowDraft(definition.draft);
    const draftNode = draft.nodes.find(node => node.id === nodeId);
    if (!draftNode) throw new NotFoundError("WORKFLOW_NODE_NOT_FOUND", "节点不存在");
    if (draftNode.data.kind !== "llm") {
      throw new BadRequestError("WORKFLOW_LLM_TEST_NODE_INVALID", "仅支持试运行大模型节点");
    }
    const config = projectWorkflowNodeExecutionConfig({
      data: draftNode.data,
      kind: "llm",
      workflowType: definition.workflowType,
    });
    const configError = getWorkflowNodeExecutionConfigError("llm", config);
    if (configError || !isWorkflowLlmExecutionConfigComplete(config)) {
      throw new BadRequestError(
        "WORKFLOW_LLM_TEST_CONFIG_INVALID",
        "请先完成大模型节点配置",
      );
    }
    const node = {
      config,
      id: draftNode.id,
      kind: "llm" as const,
      nodeSchemaVersion: draftNode.data.schemaVersion,
    };
    const inputValues = resolveLlmTestInputValues(config.inputs, input.inputValues);
    try {
      assertWorkflowRuntimeValue(inputValues, "run-context", WORKFLOW_LLM_TEST_INPUT_MAX_BYTES);
    } catch {
      throw new BadRequestError("WORKFLOW_LLM_TEST_INPUT_INVALID", "试运行输入参数过大");
    }
    let payload;
    try {
      payload = createWorkflowLlmInferenceRequest(node, new Map(Object.entries(inputValues)));
    } catch (error) {
      if (error instanceof WorkflowCapabilityExecutionError) {
        throw new BadRequestError(
          "WORKFLOW_LLM_TEST_INPUT_INVALID",
          "试运行输入无法生成有效提示词",
        );
      }
      throw error;
    }
    const createdAt = this.clock();
    const attempt = await repository.createLlmTestAttempt({
      contractVersion: 1,
      createdAt,
      deadlineAt: new Date(createdAt.getTime() + this.llmTestTimeoutMs),
      executionKey: `workflow-llm-test:${scope.uid}:${workflowId}:${nodeId}:${randomUUID()}`,
      expiresAt: new Date(createdAt.getTime() + this.llmTestTtlMs),
      inputValues,
      node,
      opSubUserId: scope.subUserId,
      payload,
      uid: scope.uid,
      workflowId,
    });
    return toLlmTestAttempt(attempt);
  }

  async createAiIntentTestAttempt(
    scope: WorkflowOperatorScope,
    workflowId: string,
    nodeId: string,
    input: WorkflowAiIntentTestAttemptCreateRequest,
  ): Promise<WorkflowLlmTestAttempt> {
    assertWorkflowAccess(scope);
    const repository = this.requireLlmTestAttemptRepository();
    const definition = await this.requireVisibleDefinition(scope, workflowId);
    await this.requireEntitlement(scope.uid, definition.workflowType);
    if (definition.draftVersion !== input.expectedDraftVersion) throw conflictError();
    const draft = normalizeWorkflowDraft(definition.draft);
    const draftNode = draft.nodes.find(node => node.id === nodeId);
    if (!draftNode) throw new NotFoundError("WORKFLOW_NODE_NOT_FOUND", "节点不存在");
    if (draftNode.data.kind !== "ai-intent") {
      throw new BadRequestError(
        "WORKFLOW_AI_INTENT_TEST_NODE_INVALID",
        "仅支持试运行意图识别节点",
      );
    }
    const config = projectWorkflowNodeExecutionConfig({
      data: draftNode.data,
      kind: "ai-intent",
      workflowType: definition.workflowType,
    });
    const configError = getWorkflowNodeExecutionConfigError("ai-intent", config);
    if (configError || !isWorkflowAiIntentExecutionConfigComplete(config)) {
      throw new BadRequestError(
        "WORKFLOW_AI_INTENT_TEST_CONFIG_INVALID",
        "请先完成意图识别节点配置",
      );
    }
    const inputType = resolveAiIntentTestInputType(draft, nodeId, config.inputSelector);
    if (!inputType || !isAiIntentTestValueCompatible(input.inputValue, inputType)) {
      throw new BadRequestError(
        "WORKFLOW_AI_INTENT_TEST_INPUT_INVALID",
        "试运行输入与节点配置不匹配",
      );
    }
    const node = {
      config,
      id: draftNode.id,
      kind: "ai-intent" as const,
      nodeSchemaVersion: draftNode.data.schemaVersion,
    };
    const inputValues = { inputValue: input.inputValue };
    try {
      assertWorkflowRuntimeValue(inputValues, "run-context", WORKFLOW_LLM_TEST_INPUT_MAX_BYTES);
    } catch {
      throw new BadRequestError("WORKFLOW_AI_INTENT_TEST_INPUT_INVALID", "试运行输入过大");
    }
    let payload;
    try {
      payload = createWorkflowAiIntentInferenceRequest(node, input.inputValue);
    } catch (error) {
      if (error instanceof WorkflowCapabilityExecutionError) {
        throw new BadRequestError(
          "WORKFLOW_AI_INTENT_TEST_INPUT_INVALID",
          "试运行输入无法生成有效提示词",
        );
      }
      throw error;
    }
    const createdAt = this.clock();
    const attempt = await repository.createLlmTestAttempt({
      contractVersion: 1,
      createdAt,
      deadlineAt: new Date(createdAt.getTime() + this.llmTestTimeoutMs),
      executionKey: `workflow-ai-intent-test:${scope.uid}:${workflowId}:${nodeId}:${randomUUID()}`,
      expiresAt: new Date(createdAt.getTime() + this.llmTestTtlMs),
      inputValues,
      node,
      opSubUserId: scope.subUserId,
      payload,
      uid: scope.uid,
      workflowId,
    });
    return toLlmTestAttempt(attempt);
  }

  async getLlmTestAttempt(
    scope: WorkflowOperatorScope,
    workflowId: string,
    nodeId: string,
    attemptId: string,
  ): Promise<WorkflowLlmTestAttempt> {
    assertWorkflowAccess(scope);
    const repository = this.requireLlmTestAttemptRepository();
    await this.requireVisibleDefinition(scope, workflowId);
    const now = this.clock();
    await repository.expireLlmTestAttempt({
      attemptId,
      now,
      uid: scope.uid,
      workflowId,
    });
    const attempt = await repository.findLlmTestAttempt({ attemptId, uid: scope.uid, workflowId });
    if (!attempt || attempt.nodeId !== nodeId || attempt.expiresAt <= now) {
      throw new NotFoundError("WORKFLOW_LLM_TEST_ATTEMPT_NOT_FOUND", "试运行记录不存在");
    }
    return toLlmTestAttempt(attempt);
  }

  async cancelLlmTestAttempt(
    scope: WorkflowOperatorScope,
    workflowId: string,
    nodeId: string,
    attemptId: string,
  ): Promise<WorkflowLlmTestAttempt> {
    assertWorkflowAccess(scope);
    const repository = this.requireLlmTestAttemptRepository();
    await this.requireVisibleDefinition(scope, workflowId);
    const cancelledAt = this.clock();
    await repository.expireLlmTestAttempt({
      attemptId,
      now: cancelledAt,
      uid: scope.uid,
      workflowId,
    });
    const attempt = await repository.findLlmTestAttempt({ attemptId, uid: scope.uid, workflowId });
    if (!attempt || attempt.nodeId !== nodeId || attempt.expiresAt <= cancelledAt) {
      throw new NotFoundError("WORKFLOW_LLM_TEST_ATTEMPT_NOT_FOUND", "试运行记录不存在");
    }
    if (attempt.status === "running") {
      await repository.cancelLlmTestAttempt({
        attemptId,
        cancelledAt,
        uid: scope.uid,
        workflowId,
      });
    }
    const current = await repository.findLlmTestAttempt({ attemptId, uid: scope.uid, workflowId });
    if (!current || current.nodeId !== nodeId || current.expiresAt <= cancelledAt) {
      throw new NotFoundError("WORKFLOW_LLM_TEST_ATTEMPT_NOT_FOUND", "试运行记录不存在");
    }
    return toLlmTestAttempt(current);
  }

  async list(scope: WorkflowOperatorScope, input: {
    limit: number;
    page?: number;
    query?: string;
    status: WorkflowDefinitionListStatus;
  }): Promise<WorkflowDefinitionListPage> {
    assertWorkflowAccess(scope);
    const workflowTypes = getVisibleWorkflowTypes(scope);
    if (workflowTypes.length === 0) return { items: [], total: 0 };
    const page = await this.repository.listDefinitions(scope.uid, {
      limit: input.limit,
      offset: ((input.page ?? 1) - 1) * input.limit,
      query: input.query?.trim() || undefined,
      status: input.status,
      workflowTypes,
    });
    const managedAccountIdsByWorkflowId = new Map(page.items.map(record => [
      record.id,
      getWorkflowListManagedAccountIds(record.draft),
    ]));
    const wecomMemberIdsByWorkflowId = new Map(page.items.map(record => [
      record.id,
      getWorkflowListWeComMemberIds(record.draft),
    ]));
    const visibleManagedAccountIds = [...new Set(
      [...managedAccountIdsByWorkflowId.values()].flatMap(ids => ids.slice(0, 3)),
    )];
    const visibleWeComMemberIds = [...new Set(
      [...wecomMemberIdsByWorkflowId.values()].flatMap(ids => ids.slice(0, 3)),
    )];
    const [managedAccountsById, metricsByWorkflowId, wecomMembersById] = await Promise.all([
      this.managedAccountReader.findByIds(scope.uid, visibleManagedAccountIds),
      this.metricReader.findByWorkflowIds(scope.uid, page.items.map(record => record.id)),
      this.findWecomMembersForList(scope.uid, visibleWeComMemberIds),
    ]);

    return {
      items: page.items.map(record => toDefinitionListItem(
        record,
        managedAccountIdsByWorkflowId.get(record.id) ?? [],
        managedAccountsById,
        metricsByWorkflowId.get(record.id),
        wecomMemberIdsByWorkflowId.get(record.id) ?? [],
        wecomMembersById,
      )),
      total: page.total,
    };
  }

  private async findWecomMembersForList(uid: number, workUserIds: number[]) {
    try {
      return await this.wecomMemberReader.findByIds(uid, workUserIds);
    } catch (error) {
      this.logger.warn(
        {
          err: error,
          operation: "workflow-list-wecom-member-preview",
          uid,
        },
        "企微成员列表预览加载失败，继续返回工作流列表",
      );
      return new Map<number, WorkflowWeComMemberSummary>();
    }
  }

  async get(scope: WorkflowOperatorScope, workflowId: string) {
    assertWorkflowAccess(scope);
    return this.toDefinition(await this.requireVisibleDefinition(scope, workflowId));
  }

  async listTemplates(scope: WorkflowOperatorScope, input: { limit: number; page?: number; query?: string; tags?: string[]; workflowType?: WorkflowType; featured?: boolean }): Promise<WorkflowTemplateListPage> {
    assertWorkflowAccess(scope);
    assertWorkflowTemplateTagIds(input.tags);
    const visibleTypes = getVisibleWorkflowTypes(scope);
    const workflowType = input.workflowType ?? visibleTypes[0];
    if (!workflowType || !visibleTypes.includes(workflowType)) return { items: [], total: 0 };
    const limit = input.featured ? Math.min(input.limit, 4) : input.limit;
    const page = await this.requireTemplateRepository().list({
      limit,
      offset: ((input.page ?? 1) - 1) * limit,
      query: input.query?.trim() || undefined,
      tags: normalizeWorkflowTemplateTagIds(input.tags),
      workflowType,
      status: "published",
    });
    return { items: page.items.map(toTemplateListItem), total: page.total };
  }

  async listTemplateDrafts(scope: WorkflowOperatorScope, input: { limit: number; page?: number; query?: string }): Promise<WorkflowTemplateListPage> {
    assertWorkflowTemplateManage(scope);
    const page = await this.requireTemplateRepository().list({
      limit: input.limit,
      offset: ((input.page ?? 1) - 1) * input.limit,
      query: input.query?.trim() || undefined,
      status: "draft",
    });
    return { items: page.items.map(toTemplateListItem), total: page.total };
  }

  async getTemplate(scope: WorkflowOperatorScope, templateId: string): Promise<WorkflowTemplateDetail> {
    assertWorkflowAccess(scope);
    const item = await this.requireTemplateRepository().find(templateId, "published");
    if (!item) throw new NotFoundError("WORKFLOW_TEMPLATE_NOT_FOUND", "模板不存在");
    if (scope.surface && !getWorkflowSurfaceTypes(scope.surface).includes(item.workflowType)) {
      throw new NotFoundError("WORKFLOW_TEMPLATE_NOT_FOUND", "模板不存在");
    }
    return toTemplateDetail(item);
  }

  async updateTemplateInfo(scope: WorkflowOperatorScope, templateId: string, input: WorkflowTemplateDraftUpdateRequest) {
    assertWorkflowTemplateManage(scope);
    const template = await this.requireTemplateRepository().find(templateId);
    if (!template || template.status !== "published") throw new NotFoundError("WORKFLOW_TEMPLATE_NOT_FOUND", "模板不存在");
    const name = input.name.trim();
    if (!name) throw new BadRequestError("WORKFLOW_TEMPLATE_NAME_REQUIRED", "模板名称不能为空");
    const description = assertWorkflowTemplateDescription(input.description);
    const tags = input.tags === undefined
      ? template.tags
      : assertWorkflowTemplateTagIds(input.tags);
    return toTemplateDetail((await this.requireTemplateRepository().update({
      ...template,
      name,
      description,
      tags,
      coverUrl: input.coverUrl?.trim() || null,
      sortOrder: input.sortOrder ?? template.sortOrder,
    }))!);
  }

  async getTemplateDraft(scope: WorkflowOperatorScope, templateId: string): Promise<WorkflowTemplateDetail> {
    assertWorkflowTemplateManage(scope);
    const item = await this.requireTemplateRepository().find(templateId, "draft");
    if (!item) throw new NotFoundError("WORKFLOW_TEMPLATE_NOT_FOUND", "模板不存在");
    return toTemplateDetail(item);
  }

  async deleteTemplateDraft(scope: WorkflowOperatorScope, templateId: string) {
    assertWorkflowTemplateManage(scope);
    if (!await this.requireTemplateRepository().deleteDraft(templateId)) {
      throw new NotFoundError("WORKFLOW_TEMPLATE_NOT_FOUND", "模板不存在");
    }
    return { id: templateId };
  }

  async updateTemplateDraft(scope: WorkflowOperatorScope, templateId: string, input: WorkflowTemplateDraftUpdateRequest) {
    assertWorkflowTemplateManage(scope);
    const template = await this.requireTemplateRepository().find(templateId, "draft");
    if (!template) throw new NotFoundError("WORKFLOW_TEMPLATE_NOT_FOUND", "模板不存在");
    const name = input.name.trim();
    if (!name) throw new BadRequestError("WORKFLOW_TEMPLATE_NAME_REQUIRED", "模板名称不能为空");
    const description = assertWorkflowTemplateDescription(input.description);
    const tags = input.tags === undefined
      ? template.tags
      : assertWorkflowTemplateTagIds(input.tags);
    return toTemplateDetail((await this.requireTemplateRepository().update({
      ...template,
      name,
      description,
      tags,
      coverUrl: input.coverUrl?.trim() || null,
      sortOrder: input.sortOrder ?? template.sortOrder,
    }))!);
  }

  async applyTemplate(scope: WorkflowOperatorScope, templateId: string, input: WorkflowTemplateApplicationRequest) {
    assertWorkflowAccess(scope);
    const template = await this.requireTemplateRepository().find(templateId, "published");
    if (!template) throw new NotFoundError("WORKFLOW_TEMPLATE_NOT_FOUND", "模板不存在");
    assertWorkflowTypeEnabled(template.workflowType);
    if (scope.surface && !getWorkflowSurfaceTypes(scope.surface).includes(template.workflowType)) throw new ForbiddenError("WORKFLOW_TYPE_FORBIDDEN", "当前入口不支持该类型");
    await this.requireEntitlement(scope.uid, template.workflowType);
    const name = (input.name ?? template.name).trim() || "未命名工作流";
    const description = (input.description ?? template.description).trim();
    // Templates created before the resource-neutrality guard may still contain
    // tenant-owned values. Sanitize again at the tenant boundary so applying a
    // historical template cannot copy those values into a new Workflow draft.
    const draft = sanitizeTemplateDraft(normalizeWorkflowDraft(template.draft));
    assertWorkflowDraftNodeContracts(draft);
    assertTemplateResourceNeutral(draft);
    const result = await this.repository.createDefinition({ clientRequestId: input.clientRequestId, description, draft, draftSemanticHash: hashDraftSemantics(draft), name, opSubUserId: scope.subUserId, uid: scope.uid, workflowType: template.workflowType });
    if (result.kind === "idempotency-conflict") throw new AppError("WORKFLOW_CREATE_REQUEST_CONFLICT", "创建请求与已有类型不一致", 409);
    return this.toDefinition(result.value);
  }

  async convertToTemplate(scope: WorkflowOperatorScope, workflowId: string, input: WorkflowTemplateConversionRequest) {
    assertWorkflowTemplateManage(scope);
    const name = input.name.trim();
    if (!name) throw new BadRequestError("WORKFLOW_TEMPLATE_NAME_REQUIRED", "模板名称不能为空");
    const description = assertWorkflowTemplateDescription(input.description);
    const definition = await this.requireVisibleDefinition(scope, workflowId);
    if (definition.draftVersion !== input.expectedDraftVersion) throw conflictError();
    const sourceDraft = normalizeWorkflowDraft(definition.draft);
    const draft = sanitizeTemplateDraft(sourceDraft);
    assertWorkflowDraftNodeContracts(draft);
    assertTemplateResourceNeutral(draft);
    const tags = assertWorkflowTemplateTagIds(input.tags);
    const template = await this.requireTemplateRepository().create({ workflowType: definition.workflowType, name, description, tags, coverUrl: input.coverUrl?.trim() || null, draft, configurationItems: inferTemplateConfigurationItems(sourceDraft), templateVersion: 1, status: "draft", sortOrder: input.sortOrder ?? 0 });
    return toTemplateDetail(template);
  }

  async publishTemplate(scope: WorkflowOperatorScope, templateId: string) {
    assertWorkflowTemplateManage(scope);
    const template = await this.requireTemplateRepository().find(templateId);
    if (!template) throw new NotFoundError("WORKFLOW_TEMPLATE_NOT_FOUND", "模板不存在");
    if (template.status !== "draft") {
      throw new BadRequestError("WORKFLOW_TEMPLATE_NOT_DRAFT", "只有草稿模板可以发布");
    }
    validateTemplateForPublish(template);
    assertWorkflowTemplateTagIds(template.tags);
    return toTemplateDetail((await this.requireTemplateRepository().update({
      ...template,
      status: "published",
      templateVersion: template.templateVersion,
    }))!);
  }

  async withdrawTemplate(scope: WorkflowOperatorScope, templateId: string) {
    assertWorkflowTemplateManage(scope);
    const template = await this.requireTemplateRepository().find(templateId);
    if (!template) throw new NotFoundError("WORKFLOW_TEMPLATE_NOT_FOUND", "模板不存在");
    if (template.status !== "published") {
      throw new BadRequestError("WORKFLOW_TEMPLATE_NOT_PUBLISHED", "只有已发布模板可以撤回");
    }
    return toTemplateDetail((await this.requireTemplateRepository().update({
      ...template,
      status: "draft",
    }))!);
  }

  private requireTemplateRepository() {
    if (!this.templateRepository) throw new ServiceUnavailableError("WORKFLOW_TEMPLATE_UNAVAILABLE", "模板服务暂不可用");
    return this.templateRepository;
  }

  async create(scope: WorkflowOperatorScope, input: WorkflowCreateRequest) {
    assertWorkflowAccess(scope);
    assertWorkflowTypeEnabled(input.workflowType);
    if (scope.surface && !getWorkflowSurfaceTypes(scope.surface).includes(input.workflowType)) {
      throw new ForbiddenError("WORKFLOW_TYPE_FORBIDDEN", "当前入口不支持该类型");
    }
    await this.requireEntitlement(scope.uid, input.workflowType);
    const name = input.name?.trim() || "未命名工作流";
    const description = input.description?.trim() || "";
    if (name.length > WORKFLOW_NAME_MAX_LENGTH) {
      throw new BadRequestError(
        "WORKFLOW_NAME_TOO_LONG",
        `名称不能超过 ${WORKFLOW_NAME_MAX_LENGTH} 字`,
      );
    }
    if (description.length > WORKFLOW_DESCRIPTION_MAX_LENGTH) {
      throw new BadRequestError(
        "WORKFLOW_DESCRIPTION_TOO_LONG",
        `备注不能超过 ${WORKFLOW_DESCRIPTION_MAX_LENGTH} 字`,
      );
    }
    const draft = createInitialWorkflowDraft(input.workflowType);
    const result = await this.repository.createDefinition({
      clientRequestId: input.clientRequestId,
      description,
      draft,
      draftSemanticHash: hashDraftSemantics(draft),
      name,
      opSubUserId: scope.subUserId,
      uid: scope.uid,
      workflowType: input.workflowType,
    });
    if (result.kind === "idempotency-conflict") {
      throw new AppError(
        "WORKFLOW_CREATE_REQUEST_CONFLICT",
        "创建请求与已有类型不一致",
        409,
      );
    }
    return this.toDefinition(result.value);
  }

  async saveDraft(scope: WorkflowOperatorScope, workflowId: string, input: WorkflowSaveDraftRequest) {
    assertWorkflowAccess(scope);
    const definition = await this.requireVisibleDefinition(scope, workflowId);
    await this.requireEntitlement(scope.uid, definition.workflowType);
    const draft = normalizeWorkflowDraft(input.draft);
    assertWorkflowDraftNodeContracts(draft);
    assertWorkflowTypePolicy(definition.workflowType, draft);
    const layoutOnly = definition.runtimeStatus === "stopped";
    if (layoutOnly && !isWorkflowDraftLayoutOnlyChange(
      normalizeWorkflowDraft(definition.draft),
      draft,
    )) {
      throw stoppedError();
    }
    return this.toDefinition(this.unwrapMutation(await this.repository.saveDraft({
      draft,
      draftSemanticHash: hashDraftSemantics(draft),
      expectedDraftVersion: input.expectedDraftVersion,
      layoutOnly,
      opSubUserId: scope.subUserId,
      uid: scope.uid,
      workflowId,
    })));
  }

  async updateMetadata(
    scope: WorkflowOperatorScope,
    workflowId: string,
    metadata: WorkflowMetadataUpdateRequest,
  ) {
    assertWorkflowAccess(scope);
    const definition = await this.requireVisibleDefinition(scope, workflowId);
    await this.requireEntitlement(scope.uid, definition.workflowType);
    const name = metadata.name.trim();
    const description = metadata.description.trim();
    if (!name) throw new BadRequestError("WORKFLOW_NAME_REQUIRED", "名称不能为空");
    if (name.length > WORKFLOW_NAME_MAX_LENGTH) {
      throw new BadRequestError(
        "WORKFLOW_NAME_TOO_LONG",
        `名称不能超过 ${WORKFLOW_NAME_MAX_LENGTH} 字`,
      );
    }
    if (description.length > WORKFLOW_DESCRIPTION_MAX_LENGTH) {
      throw new BadRequestError(
        "WORKFLOW_DESCRIPTION_TOO_LONG",
        `备注不能超过 ${WORKFLOW_DESCRIPTION_MAX_LENGTH} 字`,
      );
    }
    return this.toDefinition(this.unwrapMutation(await this.repository.updateDefinitionMetadata({
      description,
      name,
      opSubUserId: scope.subUserId,
      uid: scope.uid,
      workflowId,
    })));
  }

  async delete(scope: WorkflowOperatorScope, workflowId: string) {
    assertWorkflowAccess(scope);
    await this.requireVisibleDefinition(scope, workflowId);
    this.unwrapMutation(await this.repository.markDeleted({
      opSubUserId: scope.subUserId,
      uid: scope.uid,
      workflowId,
    }));
  }

  async submitReview(
    scope: WorkflowOperatorScope,
    workflowId: string,
    input: WorkflowReviewSubmitRequest,
  ): Promise<WorkflowPublishReview> {
    assertWorkflowAccess(scope);
    const definition = await this.requireVisibleDefinition(scope, workflowId);
    this.assertNotStopped(definition);
    if (definition.draftVersion !== input.expectedDraftVersion) throw conflictError();
    if (
      definition.publishedRevision !== null
      && definition.publishedSemanticHash === definition.draftSemanticHash
    ) {
      throw new AppError(
        "WORKFLOW_NO_UNPUBLISHED_CHANGES",
        "当前没有待审核的新版本",
        409,
      );
    }
    const normalizedDefinition = {
      ...definition,
      draft: normalizeWorkflowDraft(definition.draft),
    };
    const entitlement = await this.requireEntitlement(scope.uid, definition.workflowType);
    const subjectType = getWorkflowCapabilityProfile(definition.workflowType).subjectType;

    const nextRevision = (definition.publishedRevision ?? 0) + 1;
    const customFields = await this.listActiveReferencedCustomFields(
      scope.uid,
      normalizedDefinition.draft,
    );
    const executionSpec = this.compile(normalizedDefinition, nextRevision, customFields);
    this.assertProductionAvailability(executionSpec, entitlement, subjectType);
    const triggerBindings = await this.createTriggerBindings(
      scope.uid,
      executionSpec,
      subjectType,
    );
    const candidateHash = hashExecutionSpec({
      executionSpec,
      subjectType,
      triggerBindings,
      workflowType: definition.workflowType,
    });
    const review = this.unwrapMutation(await this.repository.submitReview({
      basePublishedRevision: definition.publishedRevision,
      candidateHash,
      changeSummary: await this.createChangeSummary(definition, normalizedDefinition.draft),
      checkedAt: this.clock(),
      draft: normalizedDefinition.draft,
      draftSemanticHash: hashDraftSemantics(normalizedDefinition.draft),
      executionSpec,
      expectedDraftVersion: input.expectedDraftVersion,
      opSubUserId: scope.subUserId,
      subjectType,
      triggerBindings,
      uid: scope.uid,
      workflowId,
      workflowType: definition.workflowType,
    }));
    return this.toReview(scope.uid, review);
  }

  async getCurrentReview(scope: WorkflowOperatorScope, workflowId: string) {
    assertWorkflowAccess(scope);
    await this.requireVisibleDefinition(scope, workflowId);
    const review = await this.repository.findCurrentReview(scope.uid, workflowId);
    return review ? this.toReview(scope.uid, review) : null;
  }

  async listReviews(
    scope: WorkflowOperatorScope,
    workflowId: string,
    input: { cursor?: string; limit: number } = { limit: 20 },
  ) {
    assertWorkflowAccess(scope);
    await this.requireVisibleDefinition(scope, workflowId);
    const page = await this.repository.listReviews(scope.uid, workflowId, input);
    const names = await this.listReviewDisplayNames(scope.uid, page.items);
    return { items: page.items.map(review => toReview(review, names)), nextCursor: page.nextCursor };
  }

  async approveReview(
    scope: WorkflowOperatorScope,
    workflowId: string,
    reviewId: string,
    input: WorkflowReviewApproveRequest,
  ) {
    assertWorkflowAccess(scope);
    const definition = await this.requireVisibleDefinition(scope, workflowId);
    this.assertNotStopped(definition);
    await this.requireEntitlement(scope.uid, definition.workflowType);
    return this.toReview(scope.uid, this.unwrapMutation(await this.repository.decideReview({
      comment: input.comment?.trim() || null,
      decision: "approved",
      opSubUserId: scope.subUserId,
      reviewId,
      uid: scope.uid,
      workflowId,
    })));
  }

  async rejectReview(
    scope: WorkflowOperatorScope,
    workflowId: string,
    reviewId: string,
    input: WorkflowReviewRejectRequest,
  ) {
    assertWorkflowAccess(scope);
    const definition = await this.requireVisibleDefinition(scope, workflowId);
    this.assertNotStopped(definition);
    await this.requireEntitlement(scope.uid, definition.workflowType);
    const review = await this.repository.findReview(scope.uid, workflowId, reviewId);
    if (!review) throw workflowNotFound();
    if (review.submittedBySubUserId === scope.subUserId) {
      throw new ForbiddenError("WORKFLOW_REVIEW_SELF_REJECT_FORBIDDEN", "提交人不能驳回自己的审核");
    }
    const reason = input.reason.trim();
    if (!reason) {
      throw new BadRequestError("WORKFLOW_REVIEW_REJECTION_REASON_REQUIRED", "请填写驳回原因");
    }
    return this.toReview(scope.uid, this.unwrapMutation(await this.repository.decideReview({
      comment: reason,
      decision: "rejected",
      opSubUserId: scope.subUserId,
      reviewId,
      uid: scope.uid,
      workflowId,
    })));
  }

  async withdrawReview(scope: WorkflowOperatorScope, workflowId: string, reviewId: string) {
    assertWorkflowAccess(scope);
    const definition = await this.requireVisibleDefinition(scope, workflowId);
    this.assertNotStopped(definition);
    return this.toReview(scope.uid, this.unwrapMutation(await this.repository.withdrawReview({
      opSubUserId: scope.subUserId,
      reviewId,
      uid: scope.uid,
      workflowId,
    })));
  }

  async restoreReview(
    scope: WorkflowOperatorScope,
    workflowId: string,
    reviewId: string,
    input: WorkflowRestoreRequest,
  ) {
    assertWorkflowAccess(scope);
    const definition = await this.requireVisibleDefinition(scope, workflowId);
    this.assertNotStopped(definition);
    await this.requireEntitlement(scope.uid, definition.workflowType);
    const review = await this.repository.findReview(scope.uid, workflowId, reviewId);
    if (!review) throw new NotFoundError("WORKFLOW_REVIEW_NOT_FOUND", "审核不存在");
    if (review.status === "pending") {
      throw new AppError("WORKFLOW_REVIEW_RESTORE_PENDING", "待审核内容无需恢复", 409);
    }
    if (review.resultingRevision !== null) {
      throw new AppError(
        "WORKFLOW_REVIEW_ALREADY_PUBLISHED",
        "该审核已发布，请从发布版本恢复",
        409,
      );
    }
    const draft = normalizeWorkflowDraft(review.draft);
    assertWorkflowDraftNodeContracts(draft);
    assertWorkflowTypePolicy(definition.workflowType, draft);
    return this.toDefinition(this.unwrapMutation(await this.repository.restoreDraft({
      draft,
      draftSemanticHash: hashDraftSemantics(draft),
      expectedDraftVersion: input.expectedDraftVersion,
      opSubUserId: scope.subUserId,
      uid: scope.uid,
      workflowId,
    })));
  }

  async publish(scope: WorkflowOperatorScope, workflowId: string, input: WorkflowPublishRequest): Promise<WorkflowPublishResult> {
    assertWorkflowAccess(scope);
    const definition = await this.requireVisibleDefinition(scope, workflowId);
    this.assertNotStopped(definition);
    const review = await this.repository.findReview(scope.uid, workflowId, input.reviewId);
    if (!review) throw new NotFoundError("WORKFLOW_REVIEW_NOT_FOUND", "审核不存在");
    if (review.status !== "approved") throw reviewInvalidStatusError(review.status);
    if (definition.publishedRevision !== review.basePublishedRevision
      || definition.draftSemanticHash !== review.draftSemanticHash) {
      throw conflictError();
    }
    const entitlement = await this.requireEntitlement(scope.uid, definition.workflowType);
    this.assertProductionAvailability(review.executionSpec, entitlement, review.subjectType);
    const customFields = await this.listActiveReferencedCustomFields(
      scope.uid,
      review.executionSpec,
    );
    try {
      this.compile(
        { ...definition, draft: review.draft },
        review.executionSpec.revision,
        customFields,
      );
    } catch (error) {
      if (error instanceof AppError && error.code === "WORKFLOW_VALIDATION_FAILED") {
        throw new AppError(
          "WORKFLOW_REVIEW_RESOURCES_CHANGED",
          "审核内容依赖的业务资源已变化，请处理后重试发布",
          409,
        );
      }
      throw error;
    }
    const currentBindings = await this.createTriggerBindings(scope.uid, review.executionSpec, review.subjectType);
    if (hashCanonicalValue(currentBindings) !== hashCanonicalValue(review.triggerBindings)) {
      throw new AppError(
        "WORKFLOW_REVIEW_RESOURCES_CHANGED",
        "审核内容依赖的业务资源已变化，请处理后重试发布",
        409,
      );
    }
    const published = this.unwrapMutation(await this.repository.publishRevision({
      candidateHash: review.candidateHash,
      opSubUserId: scope.subUserId,
      reviewId: input.reviewId,
      uid: scope.uid,
      workflowId,
    }));
    return { definition: await this.toDefinition(published.definition), revision: toRevision(published.revision) };
  }

  async enable(scope: WorkflowOperatorScope, workflowId: string) {
    assertWorkflowAccess(scope);
    const definition = await this.requireVisibleDefinition(scope, workflowId);
    if (definition.runtimeStatus !== "inactive" || definition.publishedRevision === null) {
      throw invalidStatusError(definition.runtimeStatus);
    }
    const entitlement = await this.requireEntitlement(scope.uid, definition.workflowType);
    const revision = await this.repository.findRevision(scope.uid, workflowId, definition.publishedRevision);
    if (!revision) throw new NotFoundError("WORKFLOW_REVISION_NOT_FOUND", "版本不存在");
    this.assertProductionAvailability(revision.executionSpec, entitlement, revision.subjectType);
    const enabled = this.unwrapMutation(await this.repository.enable({
      opSubUserId: scope.subUserId,
      uid: scope.uid,
      workflowId,
    }));
    return this.toDefinition(enabled);
  }

  pause(scope: WorkflowOperatorScope, workflowId: string) {
    assertWorkflowAccess(scope);
    return this.changeStatus(scope, workflowId, ["active"], "paused");
  }

  async resume(scope: WorkflowOperatorScope, workflowId: string) {
    assertWorkflowAccess(scope);
    const definition = await this.requireVisibleDefinition(scope, workflowId);
    if (definition.runtimeStatus !== "paused" || definition.publishedRevision === null) {
      throw invalidStatusError(definition.runtimeStatus);
    }
    const entitlement = await this.requireEntitlement(scope.uid, definition.workflowType);
    const revision = await this.repository.findRevision(
      scope.uid,
      workflowId,
      definition.publishedRevision,
    );
    if (!revision) throw new NotFoundError("WORKFLOW_REVISION_NOT_FOUND", "版本不存在");
    this.assertProductionAvailability(revision.executionSpec, entitlement, revision.subjectType);
    return this.changeStatus(scope, workflowId, ["paused"], "active");
  }

  stop(scope: WorkflowOperatorScope, workflowId: string) {
    assertWorkflowAccess(scope);
    return this.changeStatus(scope, workflowId, ["active", "paused"], "stopped");
  }

  async listRevisions(
    scope: WorkflowOperatorScope,
    workflowId: string,
    input: { cursor?: string; limit: number } = { limit: 20 },
  ) {
    assertWorkflowAccess(scope);
    await this.requireVisibleDefinition(scope, workflowId);
    const page = await this.repository.listRevisions(scope.uid, workflowId, input);
    return { items: page.items.map(toRevision), nextCursor: page.nextCursor };
  }

  async getRevision(scope: WorkflowOperatorScope, workflowId: string, revision: number) {
    assertWorkflowAccess(scope);
    await this.requireVisibleDefinition(scope, workflowId);
    const record = await this.repository.findRevision(scope.uid, workflowId, revision);
    if (!record) throw new NotFoundError("WORKFLOW_REVISION_NOT_FOUND", "版本不存在");
    return toRevision(record);
  }

  async restoreRevision(
    scope: WorkflowOperatorScope,
    workflowId: string,
    revision: number,
    input: WorkflowRestoreRequest,
  ) {
    assertWorkflowAccess(scope);
    const definition = await this.requireVisibleDefinition(scope, workflowId);
    this.assertNotStopped(definition);
    await this.requireEntitlement(scope.uid, definition.workflowType);
    const revisionRecord = await this.repository.findRevision(scope.uid, workflowId, revision);
    if (!revisionRecord) {
      throw new NotFoundError("WORKFLOW_REVISION_NOT_FOUND", "版本不存在");
    }
    const draft = normalizeWorkflowDraft(revisionRecord.draft);
    assertWorkflowTypePolicy(definition.workflowType, draft);
    return this.toDefinition(this.unwrapMutation(await this.repository.restoreDraft({
      draft,
      draftSemanticHash: hashDraftSemantics(draft),
      expectedDraftVersion: input.expectedDraftVersion,
      opSubUserId: scope.subUserId,
      uid: scope.uid,
      workflowId,
    })));
  }

  private async changeStatus(
    scope: WorkflowOperatorScope,
    workflowId: string,
    allowedCurrentStatuses: WorkflowDefinitionRecord["runtimeStatus"][],
    status: WorkflowDefinitionRecord["runtimeStatus"],
  ) {
    await this.requireVisibleDefinition(scope, workflowId);
    return this.toDefinition(this.unwrapMutation(await this.repository.setRuntimeStatus({
      allowedCurrentStatuses,
      opSubUserId: scope.subUserId,
      status,
      statusReason: null,
      transitionedAt: this.clock(),
      uid: scope.uid,
      workflowId,
    })));
  }

  private compile(
    definition: WorkflowDefinitionRecord,
    revision: number,
    customFields: readonly CustomFieldItem[] = [],
  ) {
    try {
      return compileWorkflowDraft({
        customFields,
        draft: definition.draft,
        revision,
        workflowId: definition.id,
        workflowType: definition.workflowType,
      });
    } catch (error) {
      if (error instanceof WorkflowCompilationError) {
        throw new BadRequestError("WORKFLOW_VALIDATION_FAILED", "校验未通过", { issues: error.issues });
      }
      throw error;
    }
  }

  private async listActiveReferencedCustomFields(uid: number, value: unknown) {
    if (getWorkflowCustomFieldVariableIds(value).length === 0) return [];
    return this.customFieldReader.listActiveFields(uid);
  }

  private async requireDefinition(uid: number, workflowId: string) {
    const definition = await this.repository.findDefinition(uid, workflowId);
    if (!definition) throw workflowNotFound();
    return definition;
  }

  private async requireVisibleDefinition(scope: WorkflowOperatorScope, workflowId: string) {
    const definition = await this.requireDefinition(scope.uid, workflowId);
    if (scope.surface && !getWorkflowSurfaceTypes(scope.surface).includes(definition.workflowType)) {
      throw workflowNotFound();
    }
    return definition;
  }

  private requireLlmTestAttemptRepository() {
    if (!this.llmTestAttemptRepository) {
      throw new AppError(
        "WORKFLOW_LLM_TEST_UNAVAILABLE",
        "大模型试运行暂不可用",
        503,
      );
    }
    return this.llmTestAttemptRepository;
  }

  private async createTriggerBindings(
    uid: number,
    spec: ReturnType<typeof compileWorkflowDraft>,
    subjectType: WorkflowRevisionRecord["subjectType"],
  ) {
    const entryNode = spec.nodes.find(node => node.id === spec.entryNodeId);
    if (!entryNode || entryNode.kind !== "start"
      || !Value.Check(WorkflowStartConfigSchema, entryNode.config)) {
      throw new Error("Compiled Workflow has an invalid Start configuration");
    }
    const config = entryNode.config as WorkflowStartConfig;
    if (subjectType !== "chatai_contact" || !("seatIds" in config)) {
      return getWorkflowTriggerBindings(config, subjectType);
    }
    let workUserIdBySeatId: Map<number, number>;
    try {
      workUserIdBySeatId = await this.sourceIdentityResolver.resolveActiveSeatWorkUserIds(
        uid,
        config.seatIds,
      );
    } catch {
      throw new AppError(
        "WORKFLOW_START_SOURCE_UNAVAILABLE",
        "暂时无法校验开始节点来源，请稍后重试",
        503,
      );
    }
    const resolvedWorkUserIds = config.seatIds.map(seatId => workUserIdBySeatId.get(seatId));
    if (resolvedWorkUserIds.some(workUserId => workUserId === undefined)) {
      throw new BadRequestError(
        "WORKFLOW_START_SOURCE_INVALID",
        "开始节点包含无效席位",
      );
    }
    if (config.entryMode !== "direct-push"
      && !config.triggers.some(trigger => trigger.type.startsWith("contact."))) {
      return getWorkflowTriggerBindings(config, subjectType);
    }
    return getWorkflowTriggerBindings(config, subjectType, {
      resolvedWorkUserIds: resolvedWorkUserIds as number[],
    });
  }

  private unwrapMutation<T>(result: WorkflowMutationResult<T>) {
    if (result.kind === "success") return result.value;
    if (result.kind === "not-found") throw workflowNotFound();
    if (result.kind === "active-limit-exceeded") {
      throw new AppError(
        "WORKFLOW_ACTIVE_LIMIT_EXCEEDED",
        "最多同时运行 50 个工作流",
        409,
      );
    }
    if (result.kind === "conflict") throw conflictError();
    if (result.kind === "review-locked") {
      throw new AppError("WORKFLOW_REVIEW_LOCKED", "已进入审核，请刷新后重试", 409);
    }
    if (result.kind === "review-invalid-status") throw reviewInvalidStatusError(result.status);
    throw invalidStatusError(result.status);
  }

  private assertNotStopped(definition: WorkflowDefinitionRecord) {
    if (definition.runtimeStatus === "stopped") throw stoppedError();
  }

  private assertProductionAvailability(
    executionSpec: ReturnType<typeof compileWorkflowDraft>,
    entitlement: WorkflowTypeEntitlementResult,
    subjectType: WorkflowRevisionRecord["subjectType"],
  ) {
    const availability = evaluateWorkflowProductionAvailability({
      entitlement,
      spec: executionSpec,
      subjectType,
    });
    if (!availability.available) {
      throw new BadRequestError(
        "WORKFLOW_PRODUCTION_UNAVAILABLE",
        "暂不可发布或运行",
        { blockers: availability.blockers },
      );
    }
  }

  private async requireEntitlement(
    uid: number,
    workflowType: WorkflowType,
  ): Promise<WorkflowTypeEntitlementResult> {
    try {
      const decision = await decideWorkflowEntitlement(this.entitlementPort, {
        uid,
        workflowType,
      });
      const refreshKey = `${uid}:${workflowType}`;
      if (decision.action === "allow") {
        this.entitlementRefreshes.delete(refreshKey);
        return decision.result;
      }
      const now = this.clock().getTime();
      const previous = this.entitlementRefreshes.get(refreshKey);
      if (previous && now - previous.attemptedAt < WorkflowService.ENTITLEMENT_REFRESH_MIN_INTERVAL_MS) {
        if (previous.outcome === "unavailable") {
          throw new WorkflowEntitlementUnavailableError();
        }
        throw new ForbiddenError(
          "WORKFLOW_ENTITLEMENT_REQUIRED",
          "当前无对应产品权益",
        );
      }
      let confirmation: WorkflowEntitlementDecision;
      try {
        confirmation = await decideWorkflowEntitlement(this.entitlementPort, {
          forceRefresh: true,
          uid,
          workflowType,
        });
      } catch (error) {
        if (error instanceof WorkflowEntitlementUnavailableError) {
          this.rememberEntitlementRefresh(refreshKey, now, "unavailable");
        }
        throw error;
      }
      if (confirmation.action === "allow") {
        this.entitlementRefreshes.delete(refreshKey);
        return confirmation.result;
      }
      this.rememberEntitlementRefresh(refreshKey, now, "denied");
      throw new ForbiddenError(
        "WORKFLOW_ENTITLEMENT_REQUIRED",
        "当前无对应产品权益",
      );
    } catch (error) {
      if (error instanceof WorkflowEntitlementUnavailableError) {
        throw new AppError(
          "WORKFLOW_ENTITLEMENT_UNAVAILABLE",
          "暂时无法确认产品权益，请稍后重试",
          503,
        );
      }
      throw error;
    }
  }

  private rememberEntitlementRefresh(
    key: string,
    attemptedAt: number,
    outcome: "denied" | "unavailable",
  ) {
    this.entitlementRefreshes.delete(key);
    this.entitlementRefreshes.set(key, { attemptedAt, outcome });
    while (this.entitlementRefreshes.size > WorkflowService.ENTITLEMENT_REFRESH_MAX_ENTRIES) {
      const oldest = this.entitlementRefreshes.keys().next().value;
      if (oldest === undefined) break;
      this.entitlementRefreshes.delete(oldest);
    }
  }

  private async toDefinition(record: WorkflowDefinitionRecord): Promise<WorkflowDefinition> {
    const review = await this.repository.findCurrentReview(record.uid, record.id);
    const names = review ? await this.listReviewDisplayNames(record.uid, [review]) : new Map();
    return toDefinition(record, review, names);
  }

  private async toReview(uid: number, record: WorkflowPublishReviewRecord) {
    const names = await this.listReviewDisplayNames(uid, [record]);
    return toReview(record, names);
  }

  private async listReviewDisplayNames(
    uid: number,
    reviews: readonly WorkflowPublishReviewRecord[],
  ) {
    return this.subUserReader.listDisplayNames(uid, reviews.flatMap(review => [
      review.submittedBySubUserId,
      review.reviewedBySubUserId,
    ].filter((id): id is string => id !== null)));
  }

  private async createChangeSummary(
    definition: WorkflowDefinitionRecord,
    draft: WorkflowDraft,
  ): Promise<WorkflowPublishReviewChangeSummary> {
    const previous = definition.publishedRevision === null
      ? null
      : await this.repository.findRevision(definition.uid, definition.id, definition.publishedRevision);
    return summarizeWorkflowChanges(previous?.draft ?? null, draft);
  }
}

function getVisibleWorkflowTypes(scope: WorkflowOperatorScope) {
  return scope.surface ? getWorkflowSurfaceTypes(scope.surface) : getEnabledWorkflowTypes();
}

function assertWorkflowDraftNodeContracts(draft: WorkflowDraft) {
  for (const node of draft.nodes) {
    const contract = getWorkflowNodeContract(node.data.kind);
    const draftConfig = extractWorkflowNodeDraftConfig(node.data.kind, node.data);
    const unknownKeys = getUnknownWorkflowNodeDraftDataKeys(node.data.kind, node.data);
    if (
      node.data.schemaVersion !== contract.currentDraftSchemaVersion
      || unknownKeys.length > 0
      || !isWorkflowNodeDraftConfig(node.data.kind, draftConfig)
    ) {
      throw new BadRequestError(
        "WORKFLOW_DRAFT_NODE_CONFIG_INVALID",
        `节点配置不符合当前契约: ${node.id}`,
      );
    }
  }
}

function validateTemplateForPublish(template: {
  draft: WorkflowDraft;
  description: string;
  workflowType: WorkflowType;
  configurationItems: WorkflowTemplateConfigurationItem[];
}) {
  assertWorkflowTemplateDescription(template.description);
  const draft = normalizeWorkflowDraft(template.draft);
  assertWorkflowDraftNodeContracts(draft);
  assertTemplateResourceNeutral(draft);
  const supported = new Set<string>(WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS);
  const unsupported = draft.nodes.filter(node => !supported.has(node.data.kind));
  if (unsupported.length > 0) {
    throw new BadRequestError("WORKFLOW_TEMPLATE_UNSUPPORTED_NODE", "模板包含暂不支持运行的节点");
  }
  const configured = new Set(template.configurationItems.map(item => `${item.nodeId}:${"bindingKey" in item ? item.bindingKey : item.fieldKey}`));
  for (const item of inferTemplateConfigurationItems(draft)) {
    if (item.requirement === "required" && !configured.has(`${item.nodeId}:${"bindingKey" in item ? item.bindingKey : item.fieldKey}`)) {
      throw new BadRequestError("WORKFLOW_TEMPLATE_CONFIGURATION_INCOMPLETE", "模板配置项不完整");
    }
  }
  const graph = validateWorkflowGraph(draft);
  if (graph.issues.length > 0) {
    throw new BadRequestError("WORKFLOW_TEMPLATE_VALIDATION_FAILED", "模板校验未通过", { issues: graph.issues });
  }
  const typePolicyIssues = validateWorkflowTypePolicy(template.workflowType, draft);
  if (typePolicyIssues.length > 0) {
    throw new BadRequestError("WORKFLOW_TEMPLATE_TYPE_POLICY_INVALID", "模板不适用于当前 Workflow 类型", { issues: typePolicyIssues });
  }
}

function assertTemplateResourceNeutral(draft: WorkflowDraft) {
  const visit = (value: unknown): string | null => {
    if (Array.isArray(value)) {
      if (isWorkflowCustomFieldSelector(value)) {
        return "selector";
      }
      for (const item of value) {
        const path = visit(item);
        if (path) return path;
      }
      return null;
    }
    if (!isRecord(value)) return null;
    for (const [key, child] of Object.entries(value)) {
      if (WORKFLOW_TEMPLATE_TENANT_RESOURCE_KEYS.has(key)) {
        const isEmptyPlaceholder = child === ""
          || (Array.isArray(child) && child.length === 0)
          || child === null;
        if (!isEmptyPlaceholder) return key;
        continue;
      }
      const path = visit(child);
      if (path) return `${key}.${path}`;
    }
    return null;
  };
  const path = visit(draft);
  if (path) throw new BadRequestError("WORKFLOW_TEMPLATE_RESOURCE_LEAK", "模板包含租户资源信息", { path });
}

function toDefinitionListItem(
  record: WorkflowDefinitionListRecord,
  managedAccountIds: number[],
  managedAccountsById: Map<number, WorkflowManagedAccountSummary>,
  metric: WorkflowMetricSummary | undefined,
  wecomMemberIds: number[],
  wecomMembersById: Map<number, WorkflowWeComMemberSummary>,
): WorkflowDefinitionListItem {
  return {
    description: record.description,
    hasUnpublishedChanges: record.publishedSemanticHash !== record.draftSemanticHash,
    id: record.id,
    inProgressRunCount: metric?.inProgressRunCount ?? 0,
    lastRunAt: metric?.lastRunAt?.toISOString() ?? null,
    managedAccountCount: managedAccountIds.length,
    managedAccounts: managedAccountIds.slice(0, 3)
      .flatMap(id => managedAccountsById.get(id) ?? []),
    name: record.name,
    publishedRevision: record.publishedRevision,
    runtimeStatus: record.runtimeStatus,
    successRatePercent: metric?.successRatePercent ?? null,
    trigger: getWorkflowListTrigger(record.draft),
    totalRunCount: metric?.totalRunCount ?? 0,
    updatedAt: record.updatedAt.toISOString(),
    wecomMemberCount: wecomMemberIds.length,
    wecomMembers: wecomMemberIds.slice(0, 3)
      .flatMap(id => wecomMembersById.get(id) ?? []),
    workflowType: record.workflowType,
  };
}

function getWorkflowListManagedAccountIds(draft: WorkflowDraft) {
  const entryNode = draft.nodes.find(node => node.data.kind === "start");
  if (!entryNode) return [];
  const config = extractWorkflowNodeDraftConfig("start", entryNode.data);
  if (!Value.Check(WorkflowStartDraftConfigSchema, config) || !("seatIds" in config)) return [];
  return (config as WorkflowStartDraftConfig & { seatIds: number[] }).seatIds;
}

function getWorkflowListWeComMemberIds(draft: WorkflowDraft) {
  const entryNode = draft.nodes.find(node => node.data.kind === "start");
  if (!entryNode) return [];
  const config = extractWorkflowNodeDraftConfig("start", entryNode.data);
  if (!Value.Check(WorkflowStartDraftConfigSchema, config) || !("workUserIds" in config)) return [];
  return (config as WorkflowStartDraftConfig & { workUserIds: number[] }).workUserIds;
}

function getWorkflowListTrigger(draft: WorkflowDraft) {
  const entryNode = draft.nodes.find(node => node.data.kind === "start");
  if (!entryNode) return "未配置";
  const config = extractWorkflowNodeDraftConfig("start", entryNode.data);
  if (!Value.Check(WorkflowStartDraftConfigSchema, config)) return "未配置";
  const startConfig = config as WorkflowStartDraftConfig;
  if (startConfig.entryMode === "direct-push") return "外部推送";
  const labels = startConfig.triggers.map((trigger) => {
    if (trigger.type === "contact.friend_added") return "添加好友";
    if (trigger.type === "contact.tag_added") return "添加标签";
    return "用户消息";
  });
  return [...new Set(labels)].join("、") || "未配置";
}

function toDefinition(
  record: WorkflowDefinitionRecord,
  currentReview: WorkflowPublishReviewRecord | null,
  reviewDisplayNames: ReadonlyMap<string, string> = new Map(),
): WorkflowDefinition {
  const reviewLocked = currentReview?.status === "pending";
  return {
    capabilitySummary: {
      runtimeSupportedNodeKinds: [...WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS],
    },
    createdAt: record.createdAt.toISOString(),
    currentReview: currentReview ? toReview(currentReview, reviewDisplayNames) : null,
    description: record.description,
    draft: normalizeWorkflowDraft(record.draft),
    draftVersion: record.draftVersion,
    hasUnpublishedChanges: record.publishedSemanticHash !== record.draftSemanticHash,
    id: record.id,
    name: record.name,
    permissions: {
      canEdit: record.runtimeStatus !== "stopped" && !reviewLocked,
      canPublish: record.runtimeStatus !== "stopped",
    },
    publishedRevision: record.publishedRevision,
    runtimeStatus: record.runtimeStatus,
    statusReason: record.statusReason,
    updatedAt: record.updatedAt.toISOString(),
    workflowType: record.workflowType,
  };
}

function toReview(
  record: WorkflowPublishReviewRecord,
  reviewDisplayNames: ReadonlyMap<string, string> = new Map(),
): WorkflowPublishReview {
  const submittedByName = reviewDisplayNames.get(record.submittedBySubUserId);
  const reviewedByName = record.reviewedBySubUserId === null
    ? undefined
    : reviewDisplayNames.get(record.reviewedBySubUserId);
  return {
    basePublishedRevision: record.basePublishedRevision,
    changeSummary: record.changeSummary,
    checkedAt: record.checkedAt.toISOString(),
    id: record.id,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    publishedBySubUserId: record.publishedBySubUserId,
    resultingRevision: record.resultingRevision,
    reviewComment: record.reviewComment,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    reviewedBySubUserId: record.reviewedBySubUserId,
    ...(reviewedByName === undefined ? {} : { reviewedByName }),
    sourceDraftVersion: record.sourceDraftVersion,
    status: record.status,
    submittedAt: record.submittedAt.toISOString(),
    submittedBySubUserId: record.submittedBySubUserId,
    ...(submittedByName === undefined ? {} : { submittedByName }),
    workflowId: record.workflowId,
  };
}

function toRevision(record: WorkflowRevisionRecord): WorkflowRevision {
  return {
    draft: normalizeWorkflowDraft(record.draft),
    id: record.id,
    publishedAt: record.publishedAt.toISOString(),
    reviewId: record.reviewId,
    revision: record.revision,
    subjectType: record.subjectType,
    workflowId: record.workflowId,
    workflowType: record.workflowType,
  };
}

function createInitialWorkflowDraft(workflowType: WorkflowType): WorkflowDraft {
  const startConfig = workflowType === "chatai_sop"
    ? { entryMode: "event" as const, entryPolicy: { mode: "never" as const }, seatIds: [], triggers: [] }
    : { entryMode: "event" as const, entryPolicy: { mode: "never" as const }, triggers: [], workUserIds: [] };
  return {
    edges: [{ id: "edge-start-end", source: "start", target: "end", type: "workflowEdge" }],
    nodes: [
      createInitialNode("start", "开始", { x: 120, y: 240 }, startConfig),
      createInitialNode("end", "结束", { x: 560, y: 240 }),
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function createInitialNode(
  kind: "end" | "start",
  title: string,
  position: { x: number; y: number },
  config: Record<string, unknown> = {},
) {
  return {
    data: { ...config, kind, label: title, metric: "", schemaVersion: 1, status: "ready" as const, title },
    id: kind,
    position,
    selected: false,
    type: "workflowNode",
  };
}

function hashExecutionSpec(input: {
  executionSpec: ReturnType<typeof compileWorkflowDraft>;
  subjectType: WorkflowRevisionRecord["subjectType"];
  triggerBindings: WorkflowTriggerBindingSpec[];
  workflowType: WorkflowType;
}) {
  const { revision: _revision, ...publishSemantics } = input.executionSpec;
  return hashCanonicalValue({
    executionSpec: publishSemantics,
    subjectType: input.subjectType,
    triggerBindings: input.triggerBindings,
    workflowType: input.workflowType,
  });
}

function hashDraftSemantics(draft: WorkflowDraft) {
  const semantics = {
    edges: draft.edges.map(({ selected: _selected, ...edge }) => edge)
      .sort((first, second) => first.id.localeCompare(second.id)),
    nodes: [...draft.nodes]
      .sort((first, second) => first.id.localeCompare(second.id))
      .map(nodeSemantics),
  };
  return hashCanonicalValue(semantics);
}

function hashCanonicalValue(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, nested]) => [key, canonicalize(nested)]));
}

function summarizeWorkflowChanges(
  previous: WorkflowDraft | null,
  next: WorkflowDraft,
): WorkflowPublishReviewChangeSummary {
  const summarizeNode = (node: WorkflowDraft["nodes"][number]) => ({
    id: node.id,
    kind: node.data.kind,
    title: node.data.title,
  });
  if (!previous) {
    return {
      addedNodes: next.nodes.map(summarizeNode),
      changedNodes: [],
      firstPublication: true,
      pathChanged: true,
      removedNodes: [],
      triggerChanged: true,
    };
  }
  const previousNodes = new Map(previous.nodes.map(node => [node.id, node]));
  const nextNodes = new Map(next.nodes.map(node => [node.id, node]));
  const addedNodes = next.nodes.filter(node => !previousNodes.has(node.id)).map(summarizeNode);
  const removedNodes = previous.nodes.filter(node => !nextNodes.has(node.id)).map(summarizeNode);
  const changedNodes = next.nodes.filter(node => {
    const oldNode = previousNodes.get(node.id);
    if (!oldNode) return false;
    return !isDeepStrictEqual(nodeSemantics(oldNode), nodeSemantics(node));
  }).map(summarizeNode);
  const previousStart = previous.nodes.find(node => node.data.kind === "start");
  const nextStart = next.nodes.find(node => node.data.kind === "start");
  return {
    addedNodes,
    changedNodes,
    firstPublication: false,
    pathChanged: !isDeepStrictEqual(edgeSemantics(previous), edgeSemantics(next)),
    removedNodes,
    triggerChanged: !isDeepStrictEqual(
      startTriggerSemantics(previousStart),
      startTriggerSemantics(nextStart),
    ),
  };
}

function nodeSemantics(node: WorkflowDraft["nodes"][number]) {
  const { position: _position, selected: _selected, ...semanticNode } = node;
  return canonicalize({
    ...semanticNode,
    data: Object.fromEntries(Object.entries(node.data).filter(([key]) =>
      key !== "label" && key !== "metric" && key !== "status")),
  });
}

function edgeSemantics(draft: WorkflowDraft) {
  return canonicalize(draft.edges
    .map(({ selected: _selected, ...edge }) => edge)
    .sort((first, second) => first.id.localeCompare(second.id)));
}

function startTriggerSemantics(node: WorkflowDraft["nodes"][number] | undefined) {
  if (!node) return null;
  const {
    label: _label,
    metric: _metric,
    status: _status,
    title: _title,
    ...trigger
  } = node.data;
  return canonicalize(trigger);
}

function assertWorkflowTypeEnabled(workflowType: WorkflowType) {
  if (getWorkflowCapabilityProfile(workflowType).availability !== "enabled") {
    throw new BadRequestError("WORKFLOW_TYPE_UNAVAILABLE", "该类型暂不可用");
  }
}

function assertWorkflowTypePolicy(workflowType: WorkflowType, draft: WorkflowDraft) {
  const issues = validateWorkflowTypePolicy(workflowType, draft);
  if (issues.length > 0) {
    throw new BadRequestError(
      "WORKFLOW_TYPE_POLICY_VIOLATION",
      "包含当前类型不支持的配置",
      { issues },
    );
  }
}

function workflowNotFound() {
  return new NotFoundError("WORKFLOW_NOT_FOUND", "内容已不存在");
}

function conflictError() {
  return new AppError("WORKFLOW_DRAFT_CONFLICT", "草稿已被其他操作更新", 409);
}

function invalidStatusError(status: WorkflowDefinitionRecord["runtimeStatus"]) {
  return status === "stopped"
    ? stoppedError()
    : new AppError("WORKFLOW_INVALID_STATUS", "当前状态不允许此操作", 409, { status });
}

function reviewInvalidStatusError(status: WorkflowPublishReviewRecord["status"]) {
  return new AppError("WORKFLOW_REVIEW_INVALID_STATUS", "当前审核状态不允许此操作", 409, { status });
}

function stoppedError() {
  return new AppError("WORKFLOW_STOPPED", "已停止后不可恢复或修改配置", 409);
}

function isWorkflowDraftLayoutOnlyChange(current: WorkflowDraft, next: WorkflowDraft) {
  if (current.nodes.length !== next.nodes.length || !isDeepStrictEqual(current.edges, next.edges)) {
    return false;
  }

  return current.nodes.every((currentNode, index) => {
    const nextNode = next.nodes[index];
    if (!nextNode || currentNode.id !== nextNode.id) return false;
    const { position: currentPosition, ...currentNodeWithoutPosition } = currentNode;
    const { position: nextPosition, ...nextNodeWithoutPosition } = nextNode;
    return isDeepStrictEqual(currentNodeWithoutPosition, nextNodeWithoutPosition);
  });
}

function assertWorkflowAccess(scope: WorkflowOperatorScope) {
  if (!scope.roles.some((role) => role === "owner" || role === "admin")) {
    throw new ForbiddenError("WORKFLOW_FORBIDDEN", "无权访问");
  }
}

function resolveLlmTestInputValues(
  inputs: WorkflowLlmInputParameter[],
  supplied: WorkflowJsonObject,
): WorkflowJsonObject {
  const knownIds = new Set(inputs.map(input => input.id));
  const unknownIds = Object.keys(supplied).filter(id => !knownIds.has(id));
  if (unknownIds.length > 0) {
    throw new BadRequestError("WORKFLOW_LLM_TEST_INPUT_INVALID", "试运行输入参数不匹配");
  }

  const result: WorkflowJsonObject = {};
  for (const input of inputs) {
    const hasSuppliedValue = Object.prototype.hasOwnProperty.call(supplied, input.id);
    if (input.value.kind === "literal") {
      const value = hasSuppliedValue ? supplied[input.id] : input.value.value;
      if (typeof value !== "string") {
        throw new BadRequestError("WORKFLOW_LLM_TEST_INPUT_INVALID", "试运行输入参数类型不匹配");
      }
      result[input.id] = value;
      continue;
    }
    if (!hasSuppliedValue) {
      throw new BadRequestError("WORKFLOW_LLM_TEST_INPUT_INVALID", "请填写全部试运行输入参数");
    }
    const value = supplied[input.id];
    if (!isLlmTestValueCompatible(value, input.value.valueType)) {
      throw new BadRequestError("WORKFLOW_LLM_TEST_INPUT_INVALID", "试运行输入参数类型不匹配");
    }
    if (value === undefined) {
      throw new BadRequestError("WORKFLOW_LLM_TEST_INPUT_INVALID", "请填写全部试运行输入参数");
    }
    result[input.id] = value;
  }
  return result;
}

function isLlmTestValueCompatible(value: unknown, valueType: WorkflowOutputValueType) {
  if (valueType.kind === "string" || valueType.kind === "datetime") {
    return typeof value === "string";
  }
  if (valueType.kind === "reference") {
    return typeof value === "string"
      || typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  }
  if (valueType.kind === "number") return typeof value === "number" && Number.isFinite(value);
  if (valueType.kind === "boolean") return typeof value === "boolean";
  if (valueType.kind === "array") {
    return Array.isArray(value) && value.every(item => {
      if (valueType.itemType === "string") return typeof item === "string";
      if (valueType.itemType === "number") return typeof item === "number" && Number.isFinite(item);
      return typeof item === "number" && Number.isSafeInteger(item) && item > 0;
    });
  }
  if (valueType.kind === "object") return isRecord(value);
  return false;
}

function resolveAiIntentTestInputType(
  draft: WorkflowDraft,
  nodeId: string,
  selector: WorkflowVariableSelector | undefined,
): WorkflowOutputValueType | null {
  if (!selector) return null;
  const [scope, sourceId, outputKey, ...rest] = selector;
  if (scope !== "node" || !sourceId || !outputKey || rest.length > 0) return null;
  const upstreamIds = getWorkflowGuaranteedUpstreamNodeIds(
    nodeId,
    draft.nodes.map(node => node.id),
    draft.edges,
  );
  if (!upstreamIds.has(sourceId)) return null;
  const sourceNode = draft.nodes.find(node => node.id === sourceId);
  if (!sourceNode) return null;
  const output = getWorkflowNodeOutputContracts(sourceNode.data.kind, sourceNode.data)
    ?.find(candidate => candidate.key === outputKey);
  if (!output || !output.usages.includes("intent-input")) return null;
  if (output.availableOnSourceOutlets
    && !isWorkflowOutputAvailableOnSourceOutlets(
      sourceId,
      nodeId,
      output.availableOnSourceOutlets,
      draft.edges,
    )) return null;
  return output.valueType;
}

function isAiIntentTestValueCompatible(value: unknown, valueType: WorkflowOutputValueType) {
  if (valueType.kind === "string") return typeof value === "string";
  if (valueType.kind !== "object") return false;
  if (valueType.schemaRef === "workflow.message.v1") {
    return Value.Check(WorkflowMessageSchema, value);
  }
  return valueType.schemaRef === "workflow.messages.v1"
    && Value.Check(WorkflowMessagesV1Schema, value);
}

function toLlmTestAttempt(record: WorkflowLlmTestAttemptRecord): WorkflowLlmTestAttempt {
  return {
    attemptId: record.id,
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    errorMessage: record.errorMessage,
    executionMode: "real",
    expiresAt: record.expiresAt.toISOString(),
    inputValues: structuredClone(record.inputValues),
    nodeId: record.nodeId,
    output: record.output ? structuredClone(record.output) : null,
    status: record.status,
    workflowId: record.workflowId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertWorkflowTemplateManage(scope: WorkflowOperatorScope) {
  if (!canManageWorkflowTemplates({ uid: scope.uid, subUserId: scope.subUserId })) {
    throw new ForbiddenError("WORKFLOW_TEMPLATE_FORBIDDEN", "无权管理模板");
  }
}


function toTemplateListItem(item: any) {
  return { coverUrl: item.coverUrl, description: item.description, id: item.id, name: item.name, nodeKinds: getTemplateNodeKinds(item.draft), nodeCount: item.draft.nodes.length, publishedAt: item.updatedAt.toISOString(), sortOrder: item.sortOrder ?? 0, tags: normalizeWorkflowTemplateTagIds(item.tags), trigger: getWorkflowListTrigger(item.draft), updatedAt: item.updatedAt.toISOString(), version: item.templateVersion, workflowType: item.workflowType };
}

function assertWorkflowTemplateTagIds(tags: readonly string[] | null | undefined) {
  const normalized = [...new Set(tags ?? [])];
  const invalid = normalized.find(tag => !isWorkflowTemplateTagId(tag));
  if (invalid) throw new BadRequestError("WORKFLOW_TEMPLATE_TAG_INVALID", "模板标签无效");
  return normalized;
}

function assertWorkflowTemplateDescription(description: string) {
  const normalized = description.trim();
  if (!normalized) throw new BadRequestError("WORKFLOW_TEMPLATE_DESCRIPTION_REQUIRED", "模板描述不能为空");
  return normalized;
}

function getTemplateNodeKinds(draft: WorkflowDraft): WorkflowNodeKind[] {
  return [...new Set(draft.nodes
    .filter(node => node.data.kind !== "start" && node.data.kind !== "end")
    .map(node => node.data.kind))];
}

function toTemplateDetail(item: any) {
  return { ...toTemplateListItem(item), configurationItems: item.configurationItems, draft: item.draft, status: item.status };
}

function sanitizeTemplateDraft(draft: WorkflowDraft): WorkflowDraft {
  const emptyArrayKeys = new Set(["accountIds", "managedAccountIds", "seatIds", "workUserIds", "friendAddWayIds", "sourceIds", "tagIds", "audienceIds", "audienceGroupIds", "customerFieldIds", "fieldIds", "materialIds", "materialCollectionIds", "modelIds"]);
  const DROP = Symbol("drop-template-value");
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(walk).filter(item => item !== DROP);
    }
    if (!value || typeof value !== "object") return value;
    if (isRecord(value)
      && value.type === "variable"
      && isWorkflowCustomFieldSelector(value.selector)) {
      return DROP;
    }
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (emptyArrayKeys.has(key)) {
        result[key] = [];
        continue;
      }
      if (key === "modelId") {
        result[key] = "";
        continue;
      }
      if (WORKFLOW_TEMPLATE_TENANT_RESOURCE_KEYS.has(key)) continue;
      const sanitized = walk(child);
      if (sanitized !== DROP) result[key] = sanitized;
    }
    return result;
  };
  const sanitized = structuredClone(draft);
  sanitized.nodes = sanitized.nodes.map(node => {
    const data = node.data as Record<string, unknown>;
    if (data.kind === "customer-update" && Array.isArray(data.fields)) {
      data.fields = data.fields.map(field => {
        if (!isRecord(field)) return field;
        const next = { ...field };
        if (isWorkflowCustomFieldVariable(next.value)) {
          next.value = { kind: "literal", value: "" };
        }
        delete next.field;
        return next;
      });
    }
    if (data.kind === "llm" && Array.isArray(data.inputs)) {
      const removedInputIds = new Set<string>();
      data.inputs = data.inputs.filter(input => {
        if (!isRecord(input) || typeof input.id !== "string") return true;
        if (!isWorkflowCustomFieldVariable(input.value)) return true;
        removedInputIds.add(input.id);
        return false;
      });
      if (removedInputIds.size > 0) {
        for (const key of ["systemPrompt", "userPrompt"]) {
          const segments = data[key];
          if (!Array.isArray(segments)) continue;
          data[key] = segments.filter(segment => {
            if (!isRecord(segment) || segment.type !== "variable" || !Array.isArray(segment.selector)) return true;
            return segment.selector[0] !== "input"
              || typeof segment.selector[1] !== "string"
              || !removedInputIds.has(segment.selector[1]);
          });
        }
      }
    }
    if (data.kind === "audience-filter") data.groups = [];
    if (data.kind === "message") data.attachments = [];
    return { ...node, data: walk(data) as typeof node.data };
  });
  return sanitized;
}

function isWorkflowCustomFieldSelector(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length === 3
    && value[0] === "subject"
    && value[1] === "customFields"
    && typeof value[2] === "string";
}

function isWorkflowCustomFieldVariable(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && (value.type === "variable" || value.kind === "variable")
    && isWorkflowCustomFieldSelector(value.selector);
}

function inferTemplateConfigurationItems(draft: WorkflowDraft) {
  const items: WorkflowTemplateConfigurationItem[] = [];
  const seen = new Set<string>();
  const addResource = (nodeId: string, resourceKind: Extract<WorkflowTemplateConfigurationItem, { kind: "resource" }>["resourceKind"], bindingKey: string, title: string) => {
    const id = `${nodeId}:${bindingKey}`;
    if (seen.has(id)) return;
    seen.add(id);
    items.push({ bindingKey, id, kind: "resource", nodeId, requirement: "required", resourceKind, title });
  };
  for (const node of draft.nodes) {
    const data = node.data as Record<string, unknown>;
    if (node.data.kind === "start") {
      if (Array.isArray(data.seatIds)) addResource(node.id, "managed-account", "seatIds", "选择托管账号");
      if (Array.isArray(data.workUserIds)) addResource(node.id, "managed-account", "workUserIds", "选择企微成员");
      if (Array.isArray(data.friendAddWayIds)) addResource(node.id, "friend-add-way", "friendAddWayIds", "选择添加方式");
      if (Array.isArray(data.triggers) && data.triggers.some(trigger => isRecord(trigger) && trigger.type === "contact.friend_added" && Array.isArray(trigger.sourceIds))) {
        addResource(node.id, "friend-add-way", "triggers.sourceIds", "选择添加方式");
      }
    }
    if (node.data.kind === "tag" || node.data.kind === "tag-query") {
      if (Array.isArray(data.tagIds)) addResource(node.id, "tag", "tagIds", "选择标签");
    }
    if (node.data.kind === "audience-filter") {
      if (Array.isArray(data.groups) && data.groups.length > 0) addResource(node.id, "audience-group", "groups", "选择人群");
    }
    if (node.data.kind === "llm" && typeof data.modelId === "string") {
      addResource(node.id, "model", "modelId", "选择模型");
    }
    if (node.data.kind === "message" && Array.isArray(data.attachments) && data.attachments.length > 0) {
      addResource(node.id, "material", "attachments", "确认素材");
    }
    if (node.data.kind === "customer-update" && (Array.isArray(data.fields) || Array.isArray(data.updates))) {
      addResource(node.id, "customer-field", "fields", "选择客户字段");
    }
  }
  const walk = (value: unknown, nodeId: string) => {
    if (Array.isArray(value)) return value.forEach(v => walk(v, nodeId));
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if ((key === "text" || key === "content" || key === "prompt") && typeof child === "string" && child.includes("{{")) {
        for (const match of child.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)) {
          const id = match[1];
          if (!id || seen.has(id)) continue;
          seen.add(id);
          items.push({ fieldKey: id, id, kind: "review", nodeId, requirement: "recommended", title: id });
        }
      }
      walk(child, nodeId);
    }
  };
  for (const node of draft.nodes) walk(node.data, node.id);
  return items;
}
