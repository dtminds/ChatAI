import { createHash } from "node:crypto";
import type {
  WorkflowCreateRequest,
  WorkflowDefinition,
  WorkflowDraft,
  WorkflowMetadataUpdateRequest,
  WorkflowPublishRequest,
  WorkflowPublishResult,
  WorkflowRestoreRequest,
  WorkflowRevision,
  WorkflowSaveDraftRequest,
  WorkflowStartConfig,
  WorkflowType,
  WorkflowTypeEntitlementResult,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import { getWorkflowCapabilityProfile, WorkflowStartConfigSchema } from "@chatai/contracts";
import {
  compileWorkflowDraft,
  createWorkflowDeploymentCapabilities,
  evaluateWorkflowProductionAvailability,
  getWorkflowTriggerBindings,
  normalizeWorkflowDraft,
  validateWorkflowTypePolicy,
  WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS,
  WorkflowCompilationError,
  type WorkflowDeploymentCapabilities,
} from "@chatai/workflow-engine";
import {
  decideWorkflowEntitlement,
  UnavailableWorkflowEntitlementPort,
  WorkflowEntitlementUnavailableError,
  type WorkflowEntitlementPort,
} from "@chatai/workflow-runtime";
import { AppError, BadRequestError, ForbiddenError, NotFoundError } from "../../shared/errors.js";
import type {
  WorkflowDefinitionRecord,
  WorkflowMutationResult,
  WorkflowRepository,
  WorkflowRevisionRecord,
} from "./workflow-repository-types.js";

export type WorkflowOperatorScope = { roles: string[]; subUserId: string; uid: number };

export type WorkflowServiceOptions = {
  clock?: () => Date;
  deploymentCapabilities?: WorkflowDeploymentCapabilities;
  entitlementPort?: WorkflowEntitlementPort;
};

export class WorkflowService {
  private readonly clock: () => Date;
  private readonly deploymentCapabilities: WorkflowDeploymentCapabilities;
  private readonly entitlementPort: WorkflowEntitlementPort;

  constructor(
    private readonly repository: WorkflowRepository,
    options: WorkflowServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.deploymentCapabilities = options.deploymentCapabilities
      ?? createWorkflowDeploymentCapabilities([]);
    this.entitlementPort = options.entitlementPort
      ?? new UnavailableWorkflowEntitlementPort();
  }

  async list(scope: WorkflowOperatorScope) {
    assertWorkflowAccess(scope);
    return (await this.repository.listDefinitions(scope.uid)).map((record) => this.toDefinition(record));
  }

  async get(scope: WorkflowOperatorScope, workflowId: string) {
    assertWorkflowAccess(scope);
    return this.toDefinition(await this.requireDefinition(scope.uid, workflowId));
  }

  async create(scope: WorkflowOperatorScope, input: WorkflowCreateRequest) {
    assertWorkflowAccess(scope);
    assertWorkflowTypeEnabled(input.workflowType);
    await this.requireEntitlement(scope.uid, input.workflowType, scope.subUserId);
    return this.toDefinition(await this.repository.createDefinition({
      clientRequestId: input.clientRequestId,
      description: input.description?.trim() || "",
      draft: createInitialWorkflowDraft(),
      name: input.name?.trim() || "未命名 Workflow",
      opSubUserId: scope.subUserId,
      uid: scope.uid,
      workflowType: input.workflowType,
    }));
  }

  async saveDraft(scope: WorkflowOperatorScope, workflowId: string, input: WorkflowSaveDraftRequest) {
    assertWorkflowAccess(scope);
    const definition = await this.requireDefinition(scope.uid, workflowId);
    const draft = normalizeWorkflowDraft(input.draft);
    assertWorkflowTypePolicy(definition.workflowType, draft);
    return this.toDefinition(this.unwrapMutation(await this.repository.saveDraft({
      draft,
      expectedDraftVersion: input.expectedDraftVersion,
      opSubUserId: scope.subUserId,
      uid: scope.uid,
      workflowId,
    })));
  }

  async rename(scope: WorkflowOperatorScope, workflowId: string, name: string) {
    assertWorkflowAccess(scope);
    const normalizedName = name.trim();
    if (!normalizedName) throw new BadRequestError("WORKFLOW_NAME_REQUIRED", "Workflow 名称不能为空");
    return this.toDefinition(this.unwrapMutation(await this.repository.updateDefinitionMetadata({
      name: normalizedName,
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
    const name = metadata.name.trim();
    const description = metadata.description.trim();
    if (!name) throw new BadRequestError("WORKFLOW_NAME_REQUIRED", "Workflow 名称不能为空");
    if (description.length > 1000) {
      throw new BadRequestError("WORKFLOW_DESCRIPTION_TOO_LONG", "Workflow 描述不能超过 1000 字");
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
    this.unwrapMutation(await this.repository.markDeleted({
      opSubUserId: scope.subUserId,
      uid: scope.uid,
      workflowId,
    }));
  }

  async publish(scope: WorkflowOperatorScope, workflowId: string, input: WorkflowPublishRequest): Promise<WorkflowPublishResult> {
    assertWorkflowAccess(scope);
    const definition = await this.requireDefinition(scope.uid, workflowId);
    this.assertNotStopped(definition);
    if (definition.draftVersion !== input.expectedDraftVersion) throw conflictError();
    const normalizedDefinition = {
      ...definition,
      draft: normalizeWorkflowDraft(definition.draft),
    };
    const entitlement = await this.requireEntitlement(
      scope.uid,
      definition.workflowType,
      scope.subUserId,
    );
    const subjectType = getWorkflowCapabilityProfile(definition.workflowType).subjectType;

    if (definition.publishedRevision === null) {
      const executionSpec = this.compile(normalizedDefinition, 1);
      this.assertProductionAvailability(executionSpec, entitlement);
      const validated = this.unwrapMutation(await this.repository.markValidated({
        expectedDraftVersion: input.expectedDraftVersion,
        opSubUserId: scope.subUserId,
        uid: scope.uid,
        workflowId,
      }));
      return { definition: this.toDefinition(validated), revision: null, validatedOnly: true };
    }

    const nextRevision = definition.publishedRevision + 1;
    const executionSpec = this.compile(normalizedDefinition, nextRevision);
    this.assertProductionAvailability(executionSpec, entitlement);
    const specHash = hashExecutionSpec({
      executionSpec,
      subjectType,
      workflowType: definition.workflowType,
    });
    const currentRevision = await this.repository.findRevision(
      scope.uid,
      workflowId,
      definition.publishedRevision,
    );
    if (currentRevision && currentRevision.specHash === specHash) {
      return {
        definition: this.toDefinition(normalizedDefinition),
        revision: toRevision(currentRevision),
        validatedOnly: false,
      };
    }
    const published = this.unwrapMutation(await this.repository.publishRevision({
      draft: normalizedDefinition.draft,
      executionSpec,
      expectedDraftVersion: input.expectedDraftVersion,
      expectedPublishedRevision: definition.publishedRevision,
      opSubUserId: scope.subUserId,
      specHash,
      subjectType,
      triggerBindings: createTriggerBindings(executionSpec, subjectType),
      uid: scope.uid,
      workflowId,
      workflowType: definition.workflowType,
    }));
    return {
      definition: this.toDefinition(published.definition),
      revision: toRevision(published.revision),
      validatedOnly: false,
    };
  }

  async enable(scope: WorkflowOperatorScope, workflowId: string) {
    assertWorkflowAccess(scope);
    const definition = await this.requireDefinition(scope.uid, workflowId);
    if (definition.runtimeStatus !== "inactive" || definition.publishedRevision !== null) {
      throw invalidStatusError(definition.runtimeStatus);
    }
    if (definition.validatedDraftVersion !== definition.draftVersion) {
      throw new AppError("WORKFLOW_DRAFT_NOT_VALIDATED", "请先发布检查当前草稿", 409);
    }
    const normalizedDraft = normalizeWorkflowDraft(definition.draft);
    const entitlement = await this.requireEntitlement(
      scope.uid,
      definition.workflowType,
      scope.subUserId,
    );
    const subjectType = getWorkflowCapabilityProfile(definition.workflowType).subjectType;
    const executionSpec = this.compile({ ...definition, draft: normalizedDraft }, 1);
    this.assertProductionAvailability(executionSpec, entitlement);
    const enabled = this.unwrapMutation(await this.repository.enable({
      draft: normalizedDraft,
      executionSpec,
      expectedDraftVersion: definition.draftVersion,
      opSubUserId: scope.subUserId,
      specHash: hashExecutionSpec({
        executionSpec,
        subjectType,
        workflowType: definition.workflowType,
      }),
      subjectType,
      triggerBindings: createTriggerBindings(executionSpec, subjectType),
      uid: scope.uid,
      workflowId,
      workflowType: definition.workflowType,
    }));
    return this.toDefinition(enabled.definition);
  }

  pause(scope: WorkflowOperatorScope, workflowId: string) {
    assertWorkflowAccess(scope);
    return this.changeStatus(scope, workflowId, ["active"], "paused");
  }

  async resume(scope: WorkflowOperatorScope, workflowId: string) {
    assertWorkflowAccess(scope);
    const definition = await this.requireDefinition(scope.uid, workflowId);
    if (definition.runtimeStatus !== "paused" || definition.publishedRevision === null) {
      throw invalidStatusError(definition.runtimeStatus);
    }
    const entitlement = await this.requireEntitlement(
      scope.uid,
      definition.workflowType,
      scope.subUserId,
    );
    const revision = await this.repository.findRevision(
      scope.uid,
      workflowId,
      definition.publishedRevision,
    );
    if (!revision) throw new NotFoundError("WORKFLOW_REVISION_NOT_FOUND", "Workflow Revision 不存在");
    this.assertProductionAvailability(revision.executionSpec, entitlement);
    return this.changeStatus(scope, workflowId, ["paused"], "active");
  }

  stop(scope: WorkflowOperatorScope, workflowId: string) {
    assertWorkflowAccess(scope);
    return this.changeStatus(scope, workflowId, ["active", "paused"], "stopped");
  }

  async listRevisions(scope: WorkflowOperatorScope, workflowId: string) {
    assertWorkflowAccess(scope);
    await this.requireDefinition(scope.uid, workflowId);
    return (await this.repository.listRevisions(scope.uid, workflowId)).map(toRevision);
  }

  async restoreRevision(
    scope: WorkflowOperatorScope,
    workflowId: string,
    revision: number,
    input: WorkflowRestoreRequest,
  ) {
    assertWorkflowAccess(scope);
    const definition = await this.requireDefinition(scope.uid, workflowId);
    this.assertNotStopped(definition);
    const revisionRecord = await this.repository.findRevision(scope.uid, workflowId, revision);
    if (!revisionRecord) {
      throw new NotFoundError("WORKFLOW_REVISION_NOT_FOUND", "Workflow Revision 不存在");
    }
    const draft = normalizeWorkflowDraft(revisionRecord.draft);
    assertWorkflowTypePolicy(definition.workflowType, draft);
    return this.toDefinition(this.unwrapMutation(await this.repository.restoreDraft({
      draft,
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
    return this.toDefinition(this.unwrapMutation(await this.repository.setRuntimeStatus({
      allowedCurrentStatuses,
      opSubUserId: scope.subUserId,
      status,
      statusReason: null,
      uid: scope.uid,
      workflowId,
    })));
  }

  private compile(definition: WorkflowDefinitionRecord, revision: number) {
    try {
      return compileWorkflowDraft({
        draft: definition.draft,
        revision,
        workflowId: definition.id,
        workflowType: definition.workflowType,
      });
    } catch (error) {
      if (error instanceof WorkflowCompilationError) {
        throw new BadRequestError("WORKFLOW_VALIDATION_FAILED", "Workflow 校验未通过", { issues: error.issues });
      }
      throw error;
    }
  }

  private async requireDefinition(uid: number, workflowId: string) {
    const definition = await this.repository.findDefinition(uid, workflowId);
    if (!definition) throw workflowNotFound();
    return definition;
  }

  private unwrapMutation<T>(result: WorkflowMutationResult<T>) {
    if (result.kind === "success") return result.value;
    if (result.kind === "not-found") throw workflowNotFound();
    if (result.kind === "conflict") throw conflictError();
    throw invalidStatusError(result.status);
  }

  private assertNotStopped(definition: WorkflowDefinitionRecord) {
    if (definition.runtimeStatus === "stopped") throw stoppedError();
  }

  private assertProductionAvailability(
    executionSpec: ReturnType<typeof compileWorkflowDraft>,
    entitlement: WorkflowTypeEntitlementResult,
  ) {
    const availability = evaluateWorkflowProductionAvailability({
      deployment: this.deploymentCapabilities,
      entitlement,
      spec: executionSpec,
    });
    if (!availability.available) {
      throw new BadRequestError(
        "WORKFLOW_PRODUCTION_UNAVAILABLE",
        "Workflow 暂不可发布或运行",
        { blockers: availability.blockers },
      );
    }
  }

  private async requireEntitlement(
    uid: number,
    workflowType: WorkflowType,
    opSubUserId: string,
  ): Promise<WorkflowTypeEntitlementResult> {
    try {
      const decision = await decideWorkflowEntitlement(this.entitlementPort, {
        now: this.clock(),
        uid,
        workflowType,
      });
      if (decision.action === "allow") return decision.result;

      await this.repository.applyEntitlementLoss({
        opSubUserId,
        transition: decision.action,
        uid,
        workflowType,
      });
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

  private toDefinition(record: WorkflowDefinitionRecord): WorkflowDefinition {
    return toDefinition(record, this.deploymentCapabilities);
  }
}

function toDefinition(
  record: WorkflowDefinitionRecord,
  deploymentCapabilities: WorkflowDeploymentCapabilities,
): WorkflowDefinition {
  return {
    capabilitySummary: {
      deploymentCapabilities: structuredClone(deploymentCapabilities.capabilities),
      deploymentFingerprint: deploymentCapabilities.fingerprint,
      runtimeSupportedNodeKinds: [...WORKFLOW_RUNTIME_SUPPORTED_NODE_KINDS],
    },
    createdAt: record.createdAt.toISOString(),
    description: record.description,
    draft: normalizeWorkflowDraft(record.draft),
    draftVersion: record.draftVersion,
    id: record.id,
    name: record.name,
    permissions: {
      canDelete: true,
      canEdit: record.runtimeStatus !== "stopped",
      canOperate: true,
      canPublish: record.runtimeStatus !== "stopped",
      canView: true,
    },
    publishedRevision: record.publishedRevision,
    runtimeStatus: record.runtimeStatus,
    statusReason: record.statusReason,
    updatedAt: record.updatedAt.toISOString(),
    validatedDraftVersion: record.validatedDraftVersion,
    workflowType: record.workflowType,
  };
}

function toRevision(record: WorkflowRevisionRecord): WorkflowRevision {
  return {
    draft: normalizeWorkflowDraft(record.draft),
    id: record.id,
    publishedAt: record.publishedAt.toISOString(),
    revision: record.revision,
    subjectType: record.subjectType,
    workflowId: record.workflowId,
    workflowType: record.workflowType,
  };
}

function createInitialWorkflowDraft(): WorkflowDraft {
  return {
    edges: [{ id: "edge-start-end", source: "start", target: "end", type: "workflowEdge" }],
    nodes: [
      createInitialNode("start", "开始", { x: 120, y: 240 }),
      createInitialNode("end", "结束", { x: 560, y: 240 }),
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function createInitialNode(kind: "end" | "start", title: string, position: { x: number; y: number }) {
  return {
    data: { kind, label: title, metric: "", schemaVersion: 1, status: "ready" as const, title },
    id: kind,
    position,
    selected: false,
    type: "workflowNode",
  };
}

function hashExecutionSpec(input: {
  executionSpec: ReturnType<typeof compileWorkflowDraft>;
  subjectType: WorkflowRevisionRecord["subjectType"];
  workflowType: WorkflowType;
}) {
  const { revision: _revision, ...publishSemantics } = input.executionSpec;
  return createHash("sha256").update(JSON.stringify({
    executionSpec: publishSemantics,
    subjectType: input.subjectType,
    workflowType: input.workflowType,
  })).digest("hex");
}

function createTriggerBindings(
  spec: ReturnType<typeof compileWorkflowDraft>,
  subjectType: WorkflowRevisionRecord["subjectType"],
) {
  const entryNode = spec.nodes.find(node => node.id === spec.entryNodeId);
  if (!entryNode || entryNode.kind !== "start" || !Value.Check(WorkflowStartConfigSchema, entryNode.config)) {
    throw new Error("Compiled Workflow has an invalid Start configuration");
  }
  return getWorkflowTriggerBindings(entryNode.config as WorkflowStartConfig, subjectType);
}

function assertWorkflowTypeEnabled(workflowType: WorkflowType) {
  if (getWorkflowCapabilityProfile(workflowType).availability !== "enabled") {
    throw new BadRequestError("WORKFLOW_TYPE_UNAVAILABLE", "该 Workflow 类型暂不可用");
  }
}

function assertWorkflowTypePolicy(workflowType: WorkflowType, draft: WorkflowDraft) {
  const issues = validateWorkflowTypePolicy(workflowType, draft);
  if (issues.length > 0) {
    throw new BadRequestError(
      "WORKFLOW_TYPE_POLICY_VIOLATION",
      "Workflow 包含当前类型不支持的配置",
      { issues },
    );
  }
}

function workflowNotFound() {
  return new NotFoundError("WORKFLOW_NOT_FOUND", "Workflow 不存在");
}

function conflictError() {
  return new AppError("WORKFLOW_DRAFT_CONFLICT", "Workflow 草稿已被其他操作更新", 409);
}

function invalidStatusError(status: WorkflowDefinitionRecord["runtimeStatus"]) {
  return status === "stopped"
    ? stoppedError()
    : new AppError("WORKFLOW_INVALID_STATUS", "当前状态不允许此操作", 409, { status });
}

function stoppedError() {
  return new AppError("WORKFLOW_STOPPED", "已停止的 Workflow 不可恢复或继续编辑", 409);
}

function assertWorkflowAccess(scope: WorkflowOperatorScope) {
  if (!scope.roles.some((role) => role === "owner" || role === "admin")) {
    throw new ForbiddenError("WORKFLOW_FORBIDDEN", "无权访问 Workflow");
  }
}
