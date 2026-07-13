import type {
  WorkflowDataOverview,
  WorkflowEntryRecordDetail,
  WorkflowEntryRecordPage,
  WorkflowEntryRecordStepNodeKind,
  WorkflowEntryRecordStatus,
  WorkflowNodeKind,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { WorkflowDatabase } from "@chatai/workflow-runtime";
import type { Database } from "../../db/schema.js";
import { NotFoundError } from "../../shared/errors.js";
import type { WorkflowDataReader } from "./workflow-data.service.js";

type DataDatabase = Database & WorkflowDatabase;

export class MysqlWorkflowDataReader implements WorkflowDataReader {
  private readonly db: Kysely<DataDatabase>;

  constructor(db: Kysely<Database>) {
    this.db = db as unknown as Kysely<DataDatabase>;
  }

  async getOverview(input: { revision: number; uid: number; workflowId: string }): Promise<WorkflowDataOverview> {
    const rows = await this.db.selectFrom("xy_wap_embed_workflow_node_metric")
      .select(["completed_count", "current_count", "entered_count", "node_id", "passed_count", "update_time"])
      .where("uid", "=", input.uid)
      .where("workflow_id", "=", input.workflowId)
      .where("revision", "=", input.revision)
      .execute();
    const nodes = new Map<string, WorkflowDataOverview["nodes"][number]>();
    let calculatedAt = new Date(0);
    for (const row of rows) {
      const metric = nodes.get(row.node_id) ?? {
        completed: 0,
        current: 0,
        entered: 0,
        nodeId: row.node_id,
        passed: 0,
      };
      metric.completed += Number(row.completed_count);
      metric.current += Number(row.current_count);
      metric.entered += Number(row.entered_count);
      metric.passed += Number(row.passed_count);
      nodes.set(row.node_id, metric);
      const updatedAt = toDate(row.update_time);
      if (updatedAt > calculatedAt) calculatedAt = updatedAt;
    }
    return {
      calculatedAt: (calculatedAt.getTime() === 0 ? new Date() : calculatedAt).toISOString(),
      nodes: [...nodes.values()],
      revision: input.revision,
    };
  }

  async listRecords(input: Parameters<WorkflowDataReader["listRecords"]>[0]): Promise<WorkflowEntryRecordPage> {
    let query = this.db.selectFrom("xy_wap_embed_workflow_run")
      .select(["create_time", "current_node_id", "id", "next_execute_at", "revision", "status", "subject_id", "update_time"])
      .where("uid", "=", input.uid)
      .where("workflow_id", "=", input.workflowId)
      .where("revision", "=", input.revision)
      .orderBy("id", "desc")
      .limit(input.limit + 1);
    if (input.cursor) query = query.where("id", "<", input.cursor);
    if (input.nodeId) query = query.where("current_node_id", "=", input.nodeId);
    if (input.status) query = query.where("status", "=", input.status);
    const rows = await query.execute();
    const pageRows = rows.slice(0, input.limit);
    const customers = await this.loadCustomers(input.uid, pageRows.map(row => row.subject_id));
    return {
      items: pageRows.map(row => ({
        createdAt: toDate(row.create_time).toISOString(),
        currentNodeId: row.current_node_id,
        customer: customers.get(row.subject_id) ?? { avatar: null, name: "未知客户" },
        nextExecuteAt: row.next_execute_at ? toDate(row.next_execute_at).toISOString() : null,
        recordId: String(row.id),
        revision: row.revision,
        status: parseStatus(row.status),
        updatedAt: toDate(row.update_time).toISOString(),
      })),
      nextCursor: rows.length > pageRows.length ? String(pageRows.at(-1)!.id) : null,
    };
  }

  async getRecord(input: Parameters<WorkflowDataReader["getRecord"]>[0]): Promise<WorkflowEntryRecordDetail> {
    const run = await this.db.selectFrom("xy_wap_embed_workflow_run")
      .select(["create_time", "current_node_id", "id", "revision", "status", "subject_id", "update_time"])
      .where("uid", "=", input.uid)
      .where("workflow_id", "=", input.workflowId)
      .where("id", "=", input.recordId)
      .executeTakeFirst();
    if (!run) throw new NotFoundError("WORKFLOW_RECORD_NOT_FOUND", "运行记录不存在");
    const [executions, revision, customers] = await Promise.all([
      this.db.selectFrom("xy_wap_embed_workflow_node_execution")
        .select(["completed_at", "create_time", "error_message", "node_id", "node_kind", "status"])
        .where("uid", "=", input.uid)
        .where("run_id", "=", input.recordId)
        .orderBy("sequence", "asc")
        .execute(),
      this.db.selectFrom("xy_wap_embed_workflow_revision")
        .select("draft_json")
        .where("uid", "=", input.uid)
        .where("workflow_id", "=", input.workflowId)
        .where("revision", "=", run.revision)
        .executeTakeFirst(),
      this.loadCustomers(input.uid, [run.subject_id]),
    ]);
    const titles = readNodeTitles(revision?.draft_json);
    const steps: WorkflowEntryRecordDetail["steps"] = executions.map(row => {
      const nodeKind = parseRecordNodeKind(row.node_kind);
      return {
        ...(row.error_message ? { description: row.error_message } : {}),
        occurredAt: toDate(row.completed_at ?? row.create_time).toISOString(),
        nodeId: row.node_id,
        nodeKind,
        status: row.status === "failed" ? "failed" : "completed",
        title: titles.get(row.node_id)?.title ?? fallbackNodeTitle(nodeKind),
      };
    });
    if (run.status === "queued" || run.status === "running" || run.status === "waiting") {
      const metadata = titles.get(run.current_node_id);
      const previousStep = steps.at(-1)?.nodeId === run.current_node_id ? steps.at(-1) : undefined;
      const currentKind = metadata?.kind ?? previousStep?.nodeKind ?? "unknown";
      const currentStep = {
        occurredAt: toDate(run.update_time).toISOString(),
        nodeId: run.current_node_id,
        nodeKind: currentKind,
        status: "current" as const,
        title: metadata?.title ?? previousStep?.title ?? fallbackNodeTitle(currentKind),
      };
      if (steps.at(-1)?.nodeId === run.current_node_id) {
        steps[steps.length - 1] = currentStep;
      } else {
        steps.push(currentStep);
      }
    }
    return {
      createdAt: toDate(run.create_time).toISOString(),
      customer: customers.get(run.subject_id) ?? { avatar: null, name: "未知客户" },
      recordId: String(run.id),
      revision: run.revision,
      status: parseStatus(run.status),
      steps,
    };
  }

  private async loadCustomers(uid: number, subjectIds: string[]) {
    const ids = [...new Set(subjectIds)];
    if (ids.length === 0) return new Map<string, { avatar: string | null; name: string }>();
    const rows = await this.db.selectFrom("xy_wap_embed_contact")
      .select(["avatar", "name", "real_name", "third_external_userid"])
      .where("uid", "=", uid)
      .where("third_external_userid", "in", ids)
      .where("biz_status", "=", 1)
      .execute();
    return new Map(rows.map(row => [row.third_external_userid, {
      avatar: row.avatar?.trim() || null,
      name: row.real_name?.trim() || row.name?.trim() || "未知客户",
    }]));
  }
}

function parseStatus(value: string): WorkflowEntryRecordStatus {
  if (["queued", "running", "waiting", "completed", "failed", "cancelled"].includes(value)) {
    return value as WorkflowEntryRecordStatus;
  }
  throw new Error(`Unknown workflow record status: ${value}`);
}

function parseKnownNodeKind(value: string): WorkflowNodeKind | null {
  if (["start", "wait", "branch", "message", "tag", "coupon", "handoff", "end"].includes(value)) {
    return value as WorkflowNodeKind;
  }
  return null;
}

function parseRecordNodeKind(value: string): WorkflowEntryRecordStepNodeKind {
  return parseKnownNodeKind(value) ?? "unknown";
}

function readNodeTitles(value: unknown) {
  const result = new Map<string, { kind: WorkflowNodeKind | null; title: string }>();
  let draft = value;
  if (typeof value === "string") {
    try {
      draft = JSON.parse(value);
    } catch {
      return result;
    }
  }
  if (!draft || typeof draft !== "object" || !("nodes" in draft) || !Array.isArray(draft.nodes)) return result;
  for (const node of draft.nodes) {
    if (!node || typeof node !== "object" || !("id" in node) || !("data" in node)) continue;
    const data = node.data;
    if (!data || typeof data !== "object" || !("kind" in data) || !("title" in data)) continue;
    if (typeof node.id === "string" && typeof data.kind === "string" && typeof data.title === "string") {
      result.set(node.id, { kind: parseKnownNodeKind(data.kind), title: data.title });
    }
  }
  return result;
}

function fallbackNodeTitle(kind: WorkflowEntryRecordStepNodeKind) {
  return ({
    branch: "条件分支", coupon: "发送优惠券", end: "结束", handoff: "转人工",
    message: "发送消息", start: "进入流程", tag: "添加标签", unknown: "未知节点", wait: "等待",
  } as const)[kind];
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}
