import {
  isValidSmartsheetWebhookUrl,
  WorkflowSmartsheetWriteCommandSchema,
  type WorkflowSmartsheetWriteCommand,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import type { Static, TSchema } from "@sinclair/typebox";
import type { WorkflowCapabilityDefinition, WorkflowCapabilityKind, WorkflowCapabilityPort, WorkflowCapabilityRequest } from "@chatai/workflow-runtime";
import { requestSmartsheetBytes } from "./smartsheet-http.js";

export const SMARTSHEET_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const SMARTSHEET_IMAGES_TOTAL_MAX_BYTES = 20 * 1024 * 1024;

export class HttpWorkflowSmartsheetWriteCapabilityPort implements WorkflowCapabilityPort {
  constructor(private readonly requestBytes = requestSmartsheetBytes) {}

  async execute<TCommandSchema extends TSchema, TResultSchema extends TSchema, TKind extends WorkflowCapabilityKind>(
    definition: WorkflowCapabilityDefinition<TCommandSchema, TResultSchema, TKind>,
    request: WorkflowCapabilityRequest<Static<TCommandSchema>, TKind>,
  ): Promise<unknown> {
    if (definition.capabilityKey !== "smartsheet.write" || definition.contractVersion !== 1
      || definition.kind !== "action" || !request.idempotencyKey
      || !Value.Check(WorkflowSmartsheetWriteCommandSchema, request.command)
      || !isValidSmartsheetWebhookUrl(request.command.webhookUrl)
      || request.deadlineAt.getTime() <= Date.now()) return { success: false };
    const command = request.command as WorkflowSmartsheetWriteCommand;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(0, request.deadlineAt.getTime() - Date.now()));
    const signal = AbortSignal.any([request.signal, controller.signal]);
    try {
      signal.throwIfAborted();
      const values: Record<string, unknown> = Object.create(null);
      const images = new Map<string, { title: string; image_base64: string }>();
      let totalBytes = 0;
      for (const field of command.fields) {
        if (Object.hasOwn(values, field.fieldId)) return { success: false };
        if (field.fieldType === "image") {
          if (typeof field.value !== "string") return { success: false };
          let image = images.get(field.value);
          if (!image) {
            const bytes = await this.downloadImage(field.value, signal);
            totalBytes += bytes.length;
            if (totalBytes > SMARTSHEET_IMAGES_TOTAL_MAX_BYTES) return { success: false };
            const extension = imageExtension(bytes);
            if (!extension) return { success: false };
            image = { title: `image.${extension}`, image_base64: bytes.toString("base64") };
            images.set(field.value, image);
          } else {
            totalBytes += Buffer.byteLength(image.image_base64, "base64");
            if (totalBytes > SMARTSHEET_IMAGES_TOTAL_MAX_BYTES) return { success: false };
          }
          values[field.fieldId] = [image];
        } else if (field.fieldType === "single_select") {
          if (typeof field.value !== "string") return { success: false };
          values[field.fieldId] = [{ text: field.value }];
        } else {
          const expectedType = field.fieldType === "number" ? "number" : field.fieldType === "checkbox" ? "boolean" : "string";
          if (typeof field.value !== expectedType) return { success: false };
          values[field.fieldId] = field.value;
        }
      }
      signal.throwIfAborted();
      // Never retry a POST: neither an HTTP error nor a broken response proves no row was inserted.
      const body = await this.requestBytes({
        url: command.webhookUrl,
        method: "POST",
        body: JSON.stringify({ add_records: [{ values }] }),
        maxBytes: 1024 * 1024,
        signal,
      });
      const result: unknown = JSON.parse(body.toString("utf8"));
      return { success: typeof result === "object" && result !== null
        && "errcode" in result && result.errcode === 0 };
    } catch {
      // Remote errors may contain the webhook key or image URL. Do not forward them to logs/output.
      return { success: false };
    } finally {
      clearTimeout(timer);
    }
  }

  private async downloadImage(url: string, signal: AbortSignal): Promise<Buffer> {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        return await this.requestBytes({
          url, method: "GET", maxBytes: SMARTSHEET_IMAGE_MAX_BYTES,
          signal: AbortSignal.any([signal, controller.signal]),
        });
      } catch (error) {
        if (attempt >= 1 || signal.aborted) throw error;
      } finally {
        clearTimeout(timer);
      }
    }
  }
}

function imageExtension(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return "gif";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return undefined;
}
