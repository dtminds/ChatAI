import {
  WorkflowContactIdentityLookupError,
  type WorkflowContactIdentity,
  type WorkflowContactIdentityLookupKey,
  type WorkflowContactIdentityPort,
} from "@chatai/workflow-runtime";

const JAVA_CONTACT_IDENTITY_PATH = "/third-internal/wap-embed-contact/get-contact-identity";

export class HttpWorkflowContactIdentityPort implements WorkflowContactIdentityPort {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: {
    baseUrl: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
    token?: string | null;
  }) {
    this.fetch = options.fetch ?? fetch;
  }

  async getContactIdentity(input: {
    key: WorkflowContactIdentityLookupKey;
    signal?: AbortSignal;
    uid: number;
  }): Promise<WorkflowContactIdentity> {
    const timeoutController = new AbortController();
    const forwardAbort = () => timeoutController.abort(input.signal?.reason);
    input.signal?.addEventListener("abort", forwardAbort, { once: true });
    const timer = setTimeout(
      () => timeoutController.abort(),
      this.options.timeoutMs ?? 3_000,
    );

    try {
      const response = await this.fetch(
        new URL(JAVA_CONTACT_IDENTITY_PATH, `${this.options.baseUrl}/`),
        {
          body: JSON.stringify(createJavaContactIdentityRequest(input.uid, input.key)),
          headers: {
            "content-type": "application/json",
            ...(this.options.token
              ? { authorization: `Bearer ${this.options.token}` }
              : {}),
          },
          method: "POST",
          signal: timeoutController.signal,
        },
      );
      if (!response.ok) {
        throw new WorkflowContactIdentityLookupError(
          `Workflow contact identity endpoint returned HTTP ${response.status}`,
        );
      }
      const body: unknown = await response.json();
      return decodeJavaContactIdentityResponse(body);
    } catch (error) {
      if (error instanceof WorkflowContactIdentityLookupError) throw error;
      throw new WorkflowContactIdentityLookupError(undefined, { cause: error });
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", forwardAbort);
    }
  }
}

export function createJavaContactIdentityRequest(
  uid: number,
  key: WorkflowContactIdentityLookupKey,
) {
  if (key.type === "thirdExternalUserId") {
    return { thirdExternalUserId: key.thirdExternalUserId, type: 1, uid };
  }
  if (key.type === "externalUserId") {
    return { externalUserId: key.externalUserId, type: 2, uid };
  }
  return { mallUserId: key.mallUserId, type: 3, uid };
}

export function decodeJavaContactIdentityResponse(body: unknown): WorkflowContactIdentity {
  if (!isRecord(body) || body.success !== true) {
    throw new WorkflowContactIdentityLookupError(
      "Workflow contact identity endpoint rejected the request",
    );
  }
  if (body.data === undefined || body.data === null) return {};
  if (!isRecord(body.data)) {
    throw new WorkflowContactIdentityLookupError(
      "Workflow contact identity endpoint returned invalid data",
    );
  }
  const data = body.data;
  assertOptionalNonNegativeSafeInteger(data.externalUserId, "externalUserId");
  assertOptionalNonNegativeSafeInteger(data.mallUserId, "mallUserId");
  assertOptionalString(data.thirdExternalUserId, "thirdExternalUserId");
  assertOptionalNonNegativeSafeInteger(data.xyId, "xyId");
  return {
    ...(data.externalUserId !== undefined && data.externalUserId !== null
      ? { externalUserId: data.externalUserId as number }
      : {}),
    ...(data.mallUserId !== undefined && data.mallUserId !== null
      ? { mallUserId: data.mallUserId as number }
      : {}),
    ...(data.thirdExternalUserId !== undefined && data.thirdExternalUserId !== null
      ? { thirdExternalUserId: data.thirdExternalUserId as string }
      : {}),
    ...(data.xyId !== undefined && data.xyId !== null
      ? { xyId: data.xyId as number }
      : {}),
  };
}

function assertOptionalNonNegativeSafeInteger(value: unknown, field: string) {
  if (value === undefined || value === null) return;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new WorkflowContactIdentityLookupError(
      `Workflow contact identity endpoint returned invalid ${field}`,
    );
  }
}

function assertOptionalString(value: unknown, field: string) {
  if (value === undefined || value === null) return;
  if (typeof value !== "string") {
    throw new WorkflowContactIdentityLookupError(
      `Workflow contact identity endpoint returned invalid ${field}`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
