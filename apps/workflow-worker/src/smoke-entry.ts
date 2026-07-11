import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import type { WorkflowEntryCommand, WorkflowStartTrigger } from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import { WorkflowEntryCommandSchema } from "@chatai/contracts";
import type {
  WorkflowDatabase,
  WorkflowTriggerBindingRecord,
} from "@chatai/workflow-runtime";
import type { Kysely } from "kysely";
import { createWorkflowBroker } from "./broker/index.js";
import type { WorkflowBroker } from "./broker/types.js";
import { loadWorkflowWorkerConfig } from "./config.js";
import { createWorkflowDatabase } from "./database.js";

export async function publishWorkflowEntrySmoke(input: {
  binding: WorkflowTriggerBindingRecord;
  broker: Pick<WorkflowBroker, "publish">;
  eventId?: string;
  now?: Date;
  subjectId: string;
  topic: string;
}) {
  const eventId = input.eventId ?? randomUUID();
  const command = createMatchingEntryCommand({
    binding: input.binding,
    eventId,
    now: input.now ?? new Date(),
    subjectId: input.subjectId,
  });
  const published = await input.broker.publish({
    data: Buffer.from(JSON.stringify(command)),
    key: input.subjectId,
    properties: { eventType: command.eventType, smoke: "true" },
    topic: input.topic,
  });
  return { eventId, messageId: published.messageId };
}

export async function runWorkflowEntrySmoke(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2),
) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "subject-id": { type: "string" },
      "workflow-id": { type: "string" },
    },
    strict: true,
  });
  const subjectId = requireCliValue(values["subject-id"], "--subject-id");
  const workflowId = requireCliValue(values["workflow-id"], "--workflow-id");
  const config = loadWorkflowWorkerConfig(env);
  const database = createWorkflowDatabase(config.databaseUrl);
  let broker: WorkflowBroker | undefined;
  try {
    const binding = await findActiveWorkflowBinding(database, workflowId);
    if (!binding) throw new Error("Workflow has no active trigger binding");
    broker = await createWorkflowBroker({
      broker: config.broker,
      serviceUrl: config.pulsar.serviceUrl,
      token: config.pulsar.token,
    });
    const result = await publishWorkflowEntrySmoke({
      binding,
      broker,
      subjectId,
      topic: config.topics.entry,
    });
    process.stdout.write(`${JSON.stringify({
      eventId: result.eventId,
      messageId: result.messageId,
      workflowId,
    })}\n`);
    return result;
  } finally {
    await Promise.allSettled([
      broker?.close() ?? Promise.resolve(),
      database.destroy(),
    ]);
  }
}

async function findActiveWorkflowBinding(
  database: Kysely<WorkflowDatabase>,
  workflowId: string,
): Promise<WorkflowTriggerBindingRecord | null> {
  const row = await database.selectFrom("xy_wap_embed_workflow_trigger_binding as binding")
    .innerJoin("xy_wap_embed_workflow_definition as definition", join => join
      .onRef("definition.uid", "=", "binding.uid")
      .onRef("definition.id", "=", "binding.workflow_id")
      .onRef("definition.published_revision", "=", "binding.revision"))
    .select([
      "binding.create_time",
      "binding.event_type",
      "binding.filter_spec_json",
      "binding.id",
      "binding.revision",
      "binding.status",
      "binding.uid",
      "binding.update_time",
      "binding.workflow_id",
    ])
    .where("binding.workflow_id", "=", workflowId)
    .where("binding.status", "=", 1)
    .where("definition.biz_status", "=", 1)
    .where("definition.runtime_status", "=", "active")
    .orderBy("binding.id", "asc")
    .limit(1)
    .executeTakeFirst();
  if (!row) return null;
  return {
    createdAt: toDate(row.create_time),
    eventType: parseEventType(row.event_type),
    filter: parseJson(row.filter_spec_json),
    id: normalizeId(row.id),
    revision: row.revision,
    status: 1,
    uid: normalizeUid(row.uid),
    updatedAt: toDate(row.update_time),
    workflowId: normalizeId(row.workflow_id),
  };
}

function createMatchingEntryCommand(input: {
  binding: WorkflowTriggerBindingRecord;
  eventId: string;
  now: Date;
  subjectId: string;
}): WorkflowEntryCommand {
  const trigger = input.binding.filter.triggers.find(item => item.type === input.binding.eventType);
  if (!trigger) throw new Error("Workflow binding has no matching trigger");
  const command = {
    accountId: input.binding.filter.accountIds[0],
    eventId: input.eventId,
    eventType: trigger.type,
    occurredAt: input.now.toISOString(),
    subjectId: input.subjectId,
    thirdUserId: input.subjectId,
    triggerPayload: createTriggerPayload(trigger, input.eventId),
    uid: String(input.binding.uid),
  };
  if (!Value.Check(WorkflowEntryCommandSchema, command)) {
    throw new Error("Workflow binding cannot produce a valid smoke event");
  }
  return command as WorkflowEntryCommand;
}

function createTriggerPayload(trigger: WorkflowStartTrigger, eventId: string) {
  if (trigger.type === "contact.friend_added") return { source: "workflow-smoke" };
  if (trigger.type === "customer.tag_added") return { tagId: trigger.tagIds[0] };
  return {
    messageId: `smoke-message-${eventId}`,
    messageType: "text" as const,
    text: trigger.match === "keywords" ? trigger.keywords[0] : "workflow smoke",
  };
}

function requireCliValue(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Missing required option: ${name}`);
  return normalized;
}

function parseJson(value: unknown) {
  return (typeof value === "string" ? JSON.parse(value) : structuredClone(value)) as WorkflowTriggerBindingRecord["filter"];
}

function parseEventType(value: string): WorkflowTriggerBindingRecord["eventType"] {
  if (value === "contact.friend_added" || value === "customer.tag_added" || value === "message.received") {
    return value;
  }
  throw new Error("Workflow binding contains an unknown event type");
}

function normalizeId(value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  throw new Error("Database returned an invalid Workflow identifier");
}

function normalizeUid(value: unknown) {
  const normalized = typeof value === "string" ? Number(value) : value;
  if (typeof normalized === "number" && Number.isSafeInteger(normalized) && normalized > 0) return normalized;
  throw new Error("Database returned an invalid Workflow tenant identifier");
}

function toDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Database returned an invalid Workflow date");
  return date;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runWorkflowEntrySmoke();
}
