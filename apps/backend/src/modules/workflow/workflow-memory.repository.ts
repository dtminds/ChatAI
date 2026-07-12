import type { WorkflowEntryEventType } from "@chatai/contracts";
import type { WorkflowTriggerBindingSpec } from "@chatai/workflow-engine";
import type {
  WorkflowDefinitionRecord,
  WorkflowMutationResult,
  WorkflowRepository,
  WorkflowRevisionRecord,
} from "./workflow-repository-types.js";
import type { WorkflowTriggerBindingReader, WorkflowTriggerBindingRecord } from "@chatai/workflow-runtime";

type MemoryDefinition = WorkflowDefinitionRecord & { clientRequestId?: string };

export class InMemoryWorkflowRepository implements WorkflowRepository, WorkflowTriggerBindingReader {
  private definitions: MemoryDefinition[] = [];
  private revisions: WorkflowRevisionRecord[] = [];
  private triggerBindings: WorkflowTriggerBindingRecord[] = [];
  private nextDefinitionId = 1n;
  private nextRevisionId = 1n;
  private nextTriggerBindingId = 1n;

  async createDefinition(input: Parameters<WorkflowRepository["createDefinition"]>[0]) {
    const existing = input.clientRequestId
      ? this.definitions.find((item) =>
          item.uid === input.uid
          && item.bizStatus === 1
          && item.clientRequestId === input.clientRequestId,
        )
      : undefined;
    if (existing) return clone(existing);

    const now = new Date();
    const definition: MemoryDefinition = {
      bizStatus: 1,
      clientRequestId: input.clientRequestId,
      createdAt: now,
      description: input.description,
      draft: clone(input.draft),
      draftSchemaVersion: 1,
      draftVersion: 1,
      id: String(this.nextDefinitionId++),
      name: input.name,
      opSubUserId: input.opSubUserId,
      publishedRevision: null,
      runtimeStatus: "inactive",
      uid: input.uid,
      updatedAt: now,
      validatedDraftVersion: null,
    };
    this.definitions.push(definition);
    return clone(definition);
  }

  async findDefinition(uid: number, workflowId: string) {
    const definition = this.findActive(uid, workflowId);
    return definition ? clone(definition) : null;
  }

  async findRevision(uid: number, workflowId: string, revision: number) {
    const item = this.revisions.find((candidate) =>
      candidate.uid === uid
      && candidate.workflowId === workflowId
      && candidate.revision === revision,
    );
    return item ? clone(item) : null;
  }

  async listDefinitions(uid: number) {
    return this.definitions
      .filter((item) => item.uid === uid && item.bizStatus === 1)
      .sort((first, second) => second.updatedAt.getTime() - first.updatedAt.getTime())
      .map(clone);
  }

  async listRevisions(uid: number, workflowId: string) {
    return this.revisions
      .filter((item) => item.uid === uid && item.workflowId === workflowId)
      .sort((first, second) => second.revision - first.revision)
      .map(clone);
  }

  async listActiveTriggerBindings(
    uid: number,
    eventType: WorkflowEntryEventType,
  ) {
    return this.triggerBindings.filter((binding) => {
      if (binding.uid !== uid || binding.eventType !== eventType || binding.status !== 1) return false;
      const definition = this.findActive(uid, binding.workflowId);
      return definition?.runtimeStatus === "active"
        && definition.publishedRevision === binding.revision;
    }).map(clone);
  }

  async saveDraft(input: Parameters<WorkflowRepository["saveDraft"]>[0]) {
    return this.mutate(input.uid, input.workflowId, (definition) => {
      if (definition.draftVersion !== input.expectedDraftVersion) return conflict();
      if (definition.runtimeStatus === "stopped") return invalidStatus(definition.runtimeStatus);
      definition.draft = clone(input.draft);
      definition.draftVersion += 1;
      definition.validatedDraftVersion = null;
      touch(definition, input.opSubUserId);
      return success(definition);
    });
  }

  async restoreDraft(input: Parameters<WorkflowRepository["restoreDraft"]>[0]) {
    return this.saveDraft(input);
  }

  async updateDefinitionMetadata(input: Parameters<WorkflowRepository["updateDefinitionMetadata"]>[0]) {
    return this.mutate(input.uid, input.workflowId, (definition) => {
      if (definition.runtimeStatus === "stopped") return invalidStatus(definition.runtimeStatus);
      if (input.name !== undefined) definition.name = input.name;
      if (input.description !== undefined) definition.description = input.description;
      touch(definition, input.opSubUserId);
      return success(definition);
    });
  }

  async markDeleted(input: Parameters<WorkflowRepository["markDeleted"]>[0]) {
    return this.mutate(input.uid, input.workflowId, (definition) => {
      definition.bizStatus = 0;
      definition.clientRequestId = undefined;
      touch(definition, input.opSubUserId);
      return success(definition);
    });
  }

  async markValidated(input: Parameters<WorkflowRepository["markValidated"]>[0]) {
    return this.mutate(input.uid, input.workflowId, (definition) => {
      if (definition.draftVersion !== input.expectedDraftVersion) return conflict();
      if (definition.runtimeStatus === "stopped") return invalidStatus(definition.runtimeStatus);
      definition.validatedDraftVersion = definition.draftVersion;
      touch(definition, input.opSubUserId);
      return success(definition);
    });
  }

  async publishRevision(input: Parameters<WorkflowRepository["publishRevision"]>[0]) {
    const definition = this.findActive(input.uid, input.workflowId);
    if (!definition) return notFound<never>();
    if (definition.draftVersion !== input.expectedDraftVersion
      || definition.publishedRevision !== input.expectedPublishedRevision) return conflict<never>();
    if (definition.runtimeStatus === "stopped" || definition.runtimeStatus === "inactive") {
      return invalidStatus<never>(definition.runtimeStatus);
    }
    const revision = this.createRevision(definition, input);
    this.replaceTriggerBindings(definition, revision.revision, input.triggerBindings);
    definition.publishedRevision = revision.revision;
    definition.validatedDraftVersion = definition.draftVersion;
    touch(definition, input.opSubUserId);
    return success({ definition: clone(definition), revision: clone(revision) });
  }

  async enable(input: Parameters<WorkflowRepository["enable"]>[0]) {
    const definition = this.findActive(input.uid, input.workflowId);
    if (!definition) return notFound<never>();
    if (definition.draftVersion !== input.expectedDraftVersion
      || definition.validatedDraftVersion !== input.expectedDraftVersion) return conflict<never>();
    if (definition.runtimeStatus !== "inactive" || definition.publishedRevision !== null) {
      return invalidStatus<never>(definition.runtimeStatus);
    }
    const revision = this.createRevision(definition, input);
    this.replaceTriggerBindings(definition, revision.revision, input.triggerBindings);
    definition.publishedRevision = 1;
    definition.runtimeStatus = "active";
    touch(definition, input.opSubUserId);
    return success({ definition: clone(definition), revision: clone(revision) });
  }

  async setRuntimeStatus(input: Parameters<WorkflowRepository["setRuntimeStatus"]>[0]) {
    return this.mutate(input.uid, input.workflowId, (definition) => {
      if (!input.allowedCurrentStatuses.includes(definition.runtimeStatus)) {
        return invalidStatus(definition.runtimeStatus);
      }
      definition.runtimeStatus = input.status;
      touch(definition, input.opSubUserId);
      return success(definition);
    });
  }

  private findActive(uid: number, workflowId: string) {
    return this.definitions.find((item) => item.uid === uid && item.id === workflowId && item.bizStatus === 1);
  }

  private async mutate(
    uid: number,
    workflowId: string,
    mutation: (definition: MemoryDefinition) => WorkflowMutationResult<WorkflowDefinitionRecord>,
  ) {
    const definition = this.findActive(uid, workflowId);
    if (!definition) return notFound<WorkflowDefinitionRecord>();
    const result = mutation(definition);
    return result.kind === "success" ? success(clone(result.value)) : result;
  }

  private createRevision(
    definition: WorkflowDefinitionRecord,
    input: {
      draft: WorkflowDefinitionRecord["draft"];
      executionSpec: WorkflowRevisionRecord["executionSpec"];
      opSubUserId: string;
      specHash: string;
    },
  ) {
    const now = new Date();
    const revision: WorkflowRevisionRecord = {
      createdAt: now,
      draft: clone(input.draft),
      executionSpec: clone(input.executionSpec),
      id: String(this.nextRevisionId++),
      publishedAt: now,
      publishSubUserId: input.opSubUserId,
      revision: input.executionSpec.revision,
      specHash: input.specHash,
      uid: definition.uid,
      workflowId: definition.id,
    };
    this.revisions.push(revision);
    return revision;
  }

  private replaceTriggerBindings(
    definition: WorkflowDefinitionRecord,
    revision: number,
    specs: WorkflowTriggerBindingSpec[],
  ) {
    for (const binding of this.triggerBindings) {
      if (binding.uid === definition.uid && binding.workflowId === definition.id && binding.status === 1) {
        binding.status = 0;
        binding.updatedAt = new Date();
      }
    }
    const now = new Date();
    for (const spec of specs) {
      this.triggerBindings.push({
        createdAt: now,
        eventType: spec.eventType,
        filter: clone(spec.filter),
        id: String(this.nextTriggerBindingId++),
        revision,
        status: 1,
        uid: definition.uid,
        updatedAt: now,
        workflowId: definition.id,
      });
    }
  }
}

function touch(definition: WorkflowDefinitionRecord, opSubUserId: string) {
  definition.opSubUserId = opSubUserId;
  definition.updatedAt = new Date();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function success<T>(value: T): WorkflowMutationResult<T> {
  return { kind: "success", value };
}

function conflict<T>(): WorkflowMutationResult<T> {
  return { kind: "conflict" };
}

function invalidStatus<T>(status: WorkflowDefinitionRecord["runtimeStatus"]): WorkflowMutationResult<T> {
  return { kind: "invalid-status", status };
}

function notFound<T>(): WorkflowMutationResult<T> {
  return { kind: "not-found" };
}
