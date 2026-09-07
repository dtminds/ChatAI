import {
  isValidSmartsheetWebhookUrl,
  isValidSmartsheetUrl,
  WorkflowSmartsheetWriteCommandSchema,
  type WorkflowSmartsheetWriteCommand,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import type { Static, TSchema } from "@sinclair/typebox";
import type { WorkflowCapabilityDefinition, WorkflowCapabilityKind, WorkflowCapabilityPort, WorkflowCapabilityRequest } from "@chatai/workflow-runtime";

export class HttpWorkflowSmartsheetWriteCapabilityPort implements WorkflowCapabilityPort {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async execute<TCommandSchema extends TSchema, TResultSchema extends TSchema, TKind extends WorkflowCapabilityKind>(
    definition: WorkflowCapabilityDefinition<TCommandSchema, TResultSchema, TKind>,
    request: WorkflowCapabilityRequest<Static<TCommandSchema>, TKind>,
  ): Promise<unknown> {
    if (definition.capabilityKey !== "smartsheet.write" || definition.contractVersion !== 1
      || definition.kind !== "action" || !request.idempotencyKey
      || !Value.Check(WorkflowSmartsheetWriteCommandSchema, request.command)
      || !isValidSmartsheetWebhookUrl(request.command.webhookUrl)
      || request.deadlineAt.getTime() <= Date.now()) return { success: false, errorCode: "INVALID_REQUEST" };
    const command = request.command as WorkflowSmartsheetWriteCommand;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.max(0, request.deadlineAt.getTime() - Date.now()));
    const signal = AbortSignal.any([request.signal, controller.signal]);
    try {
      signal.throwIfAborted();
      const values: Record<string, unknown> = Object.create(null);
      for (const field of command.fields) {
        if (Object.hasOwn(values, field.fieldId)) return { success: false, errorCode: "DUPLICATE_FIELD" };
        if (field.fieldType === "url") {
          if (typeof field.value !== "string") return { success: false, errorCode: "INVALID_URL_VALUE" };
          const url = field.value.trim();
          if (!isValidSmartsheetUrl(url)) return { success: false, errorCode: "INVALID_URL_VALUE" };
          values[field.fieldId] = [{ link: url, text: url }];
        } else if (field.fieldType === "single_select") {
          if (typeof field.value !== "string") return { success: false, errorCode: "INVALID_SINGLE_SELECT_VALUE" };
          values[field.fieldId] = [{ text: field.value }];
        } else {
          const expectedType = field.fieldType === "number" ? "number" : field.fieldType === "checkbox" ? "boolean" : "string";
          if (typeof field.value !== expectedType) return { success: false, errorCode: "INVALID_FIELD_VALUE" };
          values[field.fieldId] = field.value;
        }
      }
      signal.throwIfAborted();
      // Never retry a POST: neither an HTTP error nor a broken response proves no row was inserted.
      const response = await this.fetchImpl(command.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ add_records: [{ values }] }),
        signal,
      });
      if (!response.ok) return { success: false, errorCode: "WEBHOOK_REQUEST_FAILED" };
      const result: unknown = await response.json();
      if (typeof result !== "object" || result === null || !("errcode" in result)) return { success: false, errorCode: "INVALID_WEBHOOK_RESPONSE" };
      return result.errcode === 0 ? { success: true } : { success: false, errorCode: `WECOM_ERR_${String(result.errcode).slice(0, 32)}` };
    } catch (error) {
      if (timedOut) return { success: false, errorCode: "WEBHOOK_TIMEOUT" };
      if (request.signal.aborted) return { success: false, errorCode: "WEBHOOK_ABORTED" };
      if (error instanceof SyntaxError) return { success: false, errorCode: "INVALID_WEBHOOK_RESPONSE" };
      return { success: false, errorCode: "WEBHOOK_REQUEST_FAILED" };
    } finally {
      clearTimeout(timer);
    }
  }
}
