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
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import { WorkflowStartConfigSchema } from "@chatai/contracts";
import {
  compileWorkflowDraft,
  getWorkflowTriggerBindings,
  WorkflowCompilationError,
} from "@chatai/workflow-engine";
import { AppError, BadRequestError, ForbiddenError, NotFoundError } from "../../shared/errors.js";
import type {
  WorkflowDefinitionRecord,
  WorkflowMutationResult,
  WorkflowRepository,
  WorkflowRevisionRecord,
} from "./workflow-repository-types.js";

export type WorkflowOperatorScope = { roles: string[]; subUserId: string; uid: number };

export class WorkflowService {
  constructor(private readonly repository: WorkflowRepository) {}

  async list(scope: WorkflowOperatorScope) {
    assertWorkflowAccess(scope);
    return (await this.repository.listDefinitions(scope.uid)).map(toDefinition);
  }

  async get(scope: WorkflowOperatorScope, workflowId: string) {
    assertWorkflowAccess(scope);
    return toDefinition(await this.requireDefinition(scope.uid, workflowId));
  }

  async create(scope: WorkflowOperatorScope, input: WorkflowCreateRequest) {
    assertWorkflowAccess(scope);
    return toDefinition(await this.repository.createDefinition({
      clientRequestId: input.clientRequestId,
      description: "",
      draft: createInitialWorkflowDraft(),
      name: input.name?.trim() || "未命名 Workflow",
      opSubUserId: scope.subUserId,
      uid: scope.uid,
    }));
  }

  async saveDraft(scope: WorkflowOperatorScope, workflowId: string, input: WorkflowSaveDraftRequest) {
    assertWorkflowAccess(scope);
    return toDefinition(this.unwrapMutation(await this.repository.saveDraft({
      draft: input.draft,
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
    return toDefinition(this.unwrapMutation(await this.repository.updateDefinitionMetadata({
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
    return toDefinition(this.unwrapMutation(await this.repository.updateDefinitionMetadata({
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

    if (definition.publishedRevision === null) {
      this.compile(definition, 1);
      const validated = this.unwrapMutation(await this.repository.markValidated({
        expectedDraftVersion: input.expectedDraftVersion,
        opSubUserId: scope.subUserId,
        uid: scope.uid,
        workflowId,
      }));
      return { definition: toDefinition(validated), revision: null, validatedOnly: true };
    }

    const nextRevision = definition.publishedRevision + 1;
    const executionSpec = this.compile(definition, nextRevision);
    const published = this.unwrapMutation(await this.repository.publishRevision({
      draft: definition.draft,
      executionSpec,
      expectedDraftVersion: input.expectedDraftVersion,
      expectedPublishedRevision: definition.publishedRevision,
      opSubUserId: scope.subUserId,
      specHash: hashExecutionSpec(executionSpec),
      triggerBindings: createTriggerBindings(executionSpec),
      uid: scope.uid,
      workflowId,
    }));
    return {
      definition: toDefinition(published.definition),
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
    const executionSpec = this.compile(definition, 1);
    const enabled = this.unwrapMutation(await this.repository.enable({
      draft: definition.draft,
      executionSpec,
      expectedDraftVersion: definition.draftVersion,
      opSubUserId: scope.subUserId,
      specHash: hashExecutionSpec(executionSpec),
      triggerBindings: createTriggerBindings(executionSpec),
      uid: scope.uid,
      workflowId,
    }));
    return toDefinition(enabled.definition);
  }

  pause(scope: WorkflowOperatorScope, workflowId: string) {
    assertWorkflowAccess(scope);
    return this.changeStatus(scope, workflowId, ["active"], "paused");
  }

  resume(scope: WorkflowOperatorScope, workflowId: string) {
    assertWorkflowAccess(scope);
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
    return toDefinition(this.unwrapMutation(await this.repository.restoreDraft({
      draft: revisionRecord.draft,
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
    return toDefinition(this.unwrapMutation(await this.repository.setRuntimeStatus({
      allowedCurrentStatuses,
      opSubUserId: scope.subUserId,
      status,
      uid: scope.uid,
      workflowId,
    })));
  }

  private compile(definition: WorkflowDefinitionRecord, revision: number) {
    try {
      return compileWorkflowDraft({ draft: definition.draft, revision, workflowId: definition.id });
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
}

function toDefinition(record: WorkflowDefinitionRecord): WorkflowDefinition {
  return {
    createdAt: record.createdAt.toISOString(),
    description: record.description,
    draft: structuredClone(record.draft),
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
    updatedAt: record.updatedAt.toISOString(),
    validatedDraftVersion: record.validatedDraftVersion,
  };
}

function toRevision(record: WorkflowRevisionRecord): WorkflowRevision {
  return {
    draft: structuredClone(record.draft),
    id: record.id,
    publishedAt: record.publishedAt.toISOString(),
    revision: record.revision,
    workflowId: record.workflowId,
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
    data: { kind, label: title, metric: "", schemaVersion: 1, status: "ready" as const, summary: "", title },
    id: kind,
    position,
    selected: false,
    type: "workflowNode",
  };
}

function hashExecutionSpec(spec: object) {
  return createHash("sha256").update(JSON.stringify(spec)).digest("hex");
}

function createTriggerBindings(spec: ReturnType<typeof compileWorkflowDraft>) {
  const entryNode = spec.nodes.find(node => node.id === spec.entryNodeId);
  if (!entryNode || entryNode.kind !== "start" || !Value.Check(WorkflowStartConfigSchema, entryNode.config)) {
    throw new Error("Compiled Workflow has an invalid Start configuration");
  }
  return getWorkflowTriggerBindings(entryNode.config as WorkflowStartConfig);
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
