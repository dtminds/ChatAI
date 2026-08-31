import {
  getWorkflowCustomFieldVariableIds,
  getWorkflowCustomFieldVariableRequirements,
  getWorkflowNodeContract,
  type WorkflowContactIdentity,
  type WorkflowCustomFieldVariableRequirement,
  type WorkflowExecutionNode,
  type WorkflowIdentityField,
  type WorkflowSubjectType,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import {
  prepareWorkflowContactCustomFields,
  type WorkflowContactCustomFieldPort,
  type WorkflowCustomFieldValue,
} from "./contact-custom-field.js";

const GLOBAL_CONTEXT_REQUIRED_IDENTITIES = ["externalUserId"] as const;
const IDENTITY_FIELD_ORDER: readonly WorkflowIdentityField[] = [
  "externalUserId",
  "mallUserId",
  "thirdExternalUserId",
  "xyId",
];

export type { WorkflowContactIdentity } from "@chatai/contracts";

export type WorkflowContactIdentityLookupKey =
  | { externalUserId: number; type: "externalUserId" }
  | { mallUserId: number; type: "mallUserId" }
  | { thirdExternalUserId: string; type: "thirdExternalUserId" };

export interface WorkflowContactIdentityPort {
  getContactIdentity(input: {
    key: WorkflowContactIdentityLookupKey;
    signal?: AbortSignal;
    uid: number;
  }): Promise<WorkflowContactIdentity>;
}

export class WorkflowContactIdentityLookupError extends Error {
  readonly failureKind: "retryable" | "terminal";

  constructor(
    message = "Workflow contact identity service is unavailable",
    options?: ErrorOptions & { failureKind?: "retryable" | "terminal" },
  ) {
    super(message, options);
    this.name = "WorkflowContactIdentityLookupError";
    this.failureKind = options?.failureKind ?? "retryable";
  }
}

export type WorkflowExecutionContextRequirements = {
  customFieldIds: readonly number[];
  customFields: readonly WorkflowCustomFieldVariableRequirement[];
  globalContext: boolean;
  identities: readonly WorkflowIdentityField[];
};

export type WorkflowPreparedExecutionContext = {
  customFields: Record<string, WorkflowCustomFieldValue>;
  identities: WorkflowContactIdentity;
};

export function deriveWorkflowExecutionContextRequirements(
  node: WorkflowExecutionNode,
): WorkflowExecutionContextRequirements {
  const globalContext = usesWorkflowGlobalContext(node.config);
  const identities = new Set<WorkflowIdentityField>(
    getWorkflowNodeContract(node.kind).identityInputs,
  );
  if (globalContext) {
    GLOBAL_CONTEXT_REQUIRED_IDENTITIES.forEach(identity => identities.add(identity));
  }
  return {
    customFieldIds: getWorkflowCustomFieldVariableIds(node.config),
    customFields: getWorkflowCustomFieldVariableRequirements(node.config),
    globalContext,
    identities: IDENTITY_FIELD_ORDER.filter(identity => identities.has(identity)),
  };
}

export async function prepareWorkflowExecutionContext(input: {
  contactCustomFieldPort?: WorkflowContactCustomFieldPort;
  contactIdentityPort?: WorkflowContactIdentityPort;
  customFieldSnapshot?: Record<string, WorkflowCustomFieldValue>;
  node: WorkflowExecutionNode;
  signal?: AbortSignal;
  subjectId: string;
  subjectType: WorkflowSubjectType;
  trigger: Record<string, unknown>;
  uid: number;
}): Promise<WorkflowPreparedExecutionContext> {
  const requirements = deriveWorkflowExecutionContextRequirements(input.node);
  const requiredIdentities = new Set(requirements.identities);
  if (requirements.customFieldIds.length > 0 && input.customFieldSnapshot === undefined) {
    requiredIdentities.add("externalUserId");
  }
  if (requiredIdentities.size === 0) {
    return { customFields: input.customFieldSnapshot ?? {}, identities: {} };
  }
  const identities = createKnownWorkflowContactIdentity({
    subjectId: input.subjectId,
    subjectType: input.subjectType,
    trigger: input.trigger,
  });
  if (![...requiredIdentities].every(identity => identities[identity] !== undefined)) {
    if (!input.contactIdentityPort) {
      throw contactIdentityLookupFailure("Workflow contact identity port is not configured");
    }

    let resolved: WorkflowContactIdentity;
    try {
      resolved = await input.contactIdentityPort.getContactIdentity({
        key: createWorkflowContactIdentityLookupKey(input.subjectType, identities),
        signal: input.signal,
        uid: input.uid,
      });
    } catch (error) {
      if (error instanceof WorkflowCapabilityExecutionError) throw error;
      throw contactIdentityLookupFailure(
        error instanceof WorkflowContactIdentityLookupError
          ? error.message
          : "Workflow contact identity lookup failed",
        error instanceof WorkflowContactIdentityLookupError
          ? error.failureKind
          : "retryable",
      );
    }
    mergeWorkflowContactIdentity(identities, normalizeWorkflowContactIdentity(resolved));
  }
  if (requirements.customFieldIds.length > 0
    && input.customFieldSnapshot === undefined
    && identities.externalUserId === undefined) {
    throw contactIdentityLookupFailure(
      "Workflow contact identity lookup did not return externalUserId for custom fields",
      "terminal",
    );
  }

  const customFields = input.customFieldSnapshot ?? await prepareWorkflowContactCustomFields({
    externalUserId: identities.externalUserId!,
    port: input.contactCustomFieldPort,
    requirements: requirements.customFields,
    signal: input.signal,
    uid: input.uid,
  });
  return { customFields, identities };
}

export function usesWorkflowGlobalContext(value: unknown): boolean {
  if (Array.isArray(value)) {
    if (value.length >= 2 && value[0] === "global"
      && value.every(part => typeof part === "string")) {
      return true;
    }
    return value.some(usesWorkflowGlobalContext);
  }
  if (!isRecord(value)) return false;
  return Object.values(value).some(usesWorkflowGlobalContext);
}

function createKnownWorkflowContactIdentity(input: {
  subjectId: string;
  subjectType: WorkflowSubjectType;
  trigger: Record<string, unknown>;
}) {
  const identities: WorkflowContactIdentity = {};
  if (input.subjectType === "chatai_contact") {
    const thirdExternalUserId = readNonEmptyString(input.subjectId);
    if (!thirdExternalUserId) throw invalidSubjectIdentity();
    identities.thirdExternalUserId = thirdExternalUserId;
  } else {
    const numericSubjectId = readPositiveSafeInteger(input.subjectId);
    if (!numericSubjectId) throw invalidSubjectIdentity();
    if (input.subjectType === "wecom_contact") identities.externalUserId = numericSubjectId;
    else identities.mallUserId = numericSubjectId;
  }

  const projection = isRecord(input.trigger.projection) ? input.trigger.projection : {};
  mergeWorkflowContactIdentity(identities, normalizeWorkflowContactIdentity({
    externalUserId: projection.externalUserId,
    mallUserId: projection.mallUserId,
    thirdExternalUserId: projection.thirdExternalUserId,
    xyId: projection.xyId,
  }));
  return identities;
}

function createWorkflowContactIdentityLookupKey(
  subjectType: WorkflowSubjectType,
  identities: WorkflowContactIdentity,
): WorkflowContactIdentityLookupKey {
  if (subjectType === "chatai_contact" && identities.thirdExternalUserId) {
    return {
      thirdExternalUserId: identities.thirdExternalUserId,
      type: "thirdExternalUserId",
    };
  }
  if (subjectType === "wecom_contact" && identities.externalUserId) {
    return { externalUserId: identities.externalUserId, type: "externalUserId" };
  }
  if (subjectType === "miniapp_member" && identities.mallUserId) {
    return { mallUserId: identities.mallUserId, type: "mallUserId" };
  }
  throw invalidSubjectIdentity();
}

function normalizeWorkflowContactIdentity(input: unknown): WorkflowContactIdentity {
  if (!isRecord(input)) return {};
  const externalUserId = readPositiveSafeInteger(input.externalUserId);
  const mallUserId = readPositiveSafeInteger(input.mallUserId);
  const thirdExternalUserId = readNonEmptyString(input.thirdExternalUserId);
  const xyId = readPositiveSafeInteger(input.xyId);
  return {
    ...(externalUserId ? { externalUserId } : {}),
    ...(mallUserId ? { mallUserId } : {}),
    ...(thirdExternalUserId ? { thirdExternalUserId } : {}),
    ...(xyId ? { xyId } : {}),
  };
}

function mergeWorkflowContactIdentity(
  target: WorkflowContactIdentity,
  source: WorkflowContactIdentity,
) {
  for (const field of IDENTITY_FIELD_ORDER) {
    const value = source[field];
    if (value === undefined) continue;
    const existing = target[field];
    if (existing !== undefined && existing !== value) {
      throw new WorkflowCapabilityExecutionError(
        "terminal",
        "WORKFLOW_CONTACT_IDENTITY_CONFLICT",
        "客户身份信息异常，流程已停止",
        { diagnosticMessage: `Workflow contact identity conflicts on ${field}` },
      );
    }
    Object.assign(target, { [field]: value });
  }
}

function contactIdentityLookupFailure(
  diagnosticMessage: string,
  failureKind: "retryable" | "terminal" = "retryable",
) {
  return new WorkflowCapabilityExecutionError(
    failureKind,
    failureKind === "terminal"
      ? "WORKFLOW_CONTACT_IDENTITY_REJECTED"
      : "WORKFLOW_CONTACT_IDENTITY_LOOKUP_FAILED",
    failureKind === "terminal"
      ? "客户身份信息查询失败，流程已停止"
      : "客户身份信息查询暂时失败",
    { diagnosticMessage },
  );
}

function invalidSubjectIdentity() {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_CONTACT_IDENTITY_INVALID",
    "客户身份信息异常，流程已停止",
    { diagnosticMessage: "Workflow Run subject cannot be used for contact identity lookup" },
  );
}

function readPositiveSafeInteger(value: unknown) {
  const number = typeof value === "string" && /^[1-9][0-9]*$/.test(value)
    ? Number(value)
    : value;
  return typeof number === "number" && Number.isSafeInteger(number) && number > 0
    ? number
    : null;
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
