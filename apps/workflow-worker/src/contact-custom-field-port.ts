import { decodeJavaInternalApiEnvelope } from "@chatai/contracts";
import {
  WorkflowContactCustomFieldLookupError,
  type WorkflowContactCustomFieldPort,
  type WorkflowContactCustomFieldValue,
} from "@chatai/workflow-runtime";
import { isRecord } from "./capability-port-support.js";

const JAVA_CONTACT_CUSTOM_FIELD_PATH = "/third-internal/custom-field/get-contact-custom-field";

export class HttpWorkflowContactCustomFieldPort implements WorkflowContactCustomFieldPort {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: {
    baseUrl: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
    token?: string | null;
  }) {
    this.fetch = options.fetch ?? fetch;
  }

  async getContactCustomFields(input: {
    externalUserId: number;
    signal?: AbortSignal;
    uid: number;
  }): Promise<WorkflowContactCustomFieldValue[]> {
    const timeoutController = new AbortController();
    const forwardAbort = () => timeoutController.abort(input.signal?.reason);
    input.signal?.addEventListener("abort", forwardAbort, { once: true });
    const timer = setTimeout(
      () => timeoutController.abort(),
      this.options.timeoutMs ?? 3_000,
    );

    try {
      const response = await this.fetch(
        new URL(JAVA_CONTACT_CUSTOM_FIELD_PATH, `${this.options.baseUrl}/`),
        {
          body: JSON.stringify({
            externalUserId: input.externalUserId,
            uid: input.uid,
          }),
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
      if (response.status !== 200) {
        throw new WorkflowContactCustomFieldLookupError(
          `Workflow contact custom field endpoint returned HTTP ${response.status}`,
        );
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw terminalCustomFieldError(
          "Workflow contact custom field endpoint returned invalid JSON",
        );
      }
      return decodeJavaContactCustomFieldResponse(body);
    } catch (error) {
      if (error instanceof WorkflowContactCustomFieldLookupError) throw error;
      throw new WorkflowContactCustomFieldLookupError(undefined, { cause: error });
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", forwardAbort);
    }
  }
}

export function decodeJavaContactCustomFieldResponse(
  body: unknown,
): WorkflowContactCustomFieldValue[] {
  const envelope = decodeJavaInternalApiEnvelope(body);
  if (envelope.kind === "invalid") {
    throw terminalCustomFieldError(
      `Workflow contact custom field endpoint returned an invalid envelope: ${envelope.reason}`,
    );
  }
  if (envelope.kind === "rejected") {
    throw terminalCustomFieldError(
      `Workflow contact custom field endpoint rejected the request: ${envelope.error} ${envelope.errorMsg.trim()}`.trim(),
    );
  }
  if (!Array.isArray(envelope.payload.data)) {
    throw terminalCustomFieldError(
      "Workflow contact custom field endpoint returned invalid data",
    );
  }

  const seen = new Set<number>();
  return envelope.payload.data.map((item, index) => {
    if (!isRecord(item)) {
      throw terminalCustomFieldError(
        `Workflow contact custom field endpoint returned invalid item ${index}`,
      );
    }
    const fieldId = item.fieldid;
    const fieldType = item.type;
    const rawValue = item.optionVal;
    if (typeof fieldId !== "number" || !Number.isSafeInteger(fieldId) || fieldId <= 0) {
      throw terminalCustomFieldError(
        `Workflow contact custom field endpoint returned invalid fieldid at item ${index}`,
      );
    }
    if (typeof fieldType !== "number" || !Number.isSafeInteger(fieldType) || fieldType <= 0) {
      throw terminalCustomFieldError(
        `Workflow contact custom field endpoint returned invalid type at item ${index}`,
      );
    }
    if (typeof rawValue !== "string") {
      throw terminalCustomFieldError(
        `Workflow contact custom field endpoint returned invalid optionVal at item ${index}`,
      );
    }
    if (seen.has(fieldId)) {
      throw terminalCustomFieldError(
        `Workflow contact custom field endpoint returned duplicate fieldid ${fieldId}`,
      );
    }
    seen.add(fieldId);
    return { fieldId, fieldType, rawValue };
  });
}

function terminalCustomFieldError(message: string) {
  return new WorkflowContactCustomFieldLookupError(message, { failureKind: "terminal" });
}
