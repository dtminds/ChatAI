import {
  WORKFLOW_RUN_RETENTION_DAYS,
  WorkflowFlowChangedReasonSchema,
  type WorkflowDataOverview,
  type WorkflowEntryRecordDetail,
  type WorkflowEntryRecordPage,
  type WorkflowEntryRecordStepNodeKind,
  type WorkflowEntryRecordStatus,
  type WorkflowFlowChangedReason,
  type WorkflowNodeKind,
  type WorkflowType,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import { sql, type Kysely } from "kysely";
import {
  decodeWorkflowSubjectType,
  encodeWorkflowType,
  type WorkflowDatabase,
} from "@chatai/workflow-runtime";
import type { Database } from "../../db/schema.js";
import { NotFoundError } from "../../shared/errors.js";
import { CURRENT_WORKBENCH_PLATFORM } from "../workbench-platform-scope.js";
import type { WorkflowDataReader } from "./workflow-data.service.js";

type DataDatabase = Database & WorkflowDatabase;

export class MysqlWorkflowDataReader implements WorkflowDataReader {
  private readonly db: Kysely<DataDatabase>;

  constructor(db: Kysely<Database>) {
    this.db = db as unknown as Kysely<DataDatabase>;
  }

  async getCapacityUsage(input: { date: string; uid: number }) {
    const [guard, dailyMetric] = await Promise.all([
      this.db.selectFrom("xy_wap_embed_workflow_capacity_guard")
        .select("active_run_count")
        .where("uid", "=", input.uid)
        .executeTakeFirst(),
      this.db.selectFrom("xy_wap_embed_workflow_capacity_daily_metric")
        .select("capacity_rejected_count")
        .where("uid", "=", input.uid)
        .where("metric_date", "=", new Date(`${input.date}T00:00:00+08:00`))
        .executeTakeFirst(),
    ]);
    return {
      activeRunCount: Number(guard?.active_run_count ?? 0),
      capacityRejectedCountToday: Number(dailyMetric?.capacity_rejected_count ?? 0),
    };
  }

  async getTenantOverview(input: Parameters<WorkflowDataReader["getTenantOverview"]>[0]) {
    if (input.workflowTypes?.length === 0) {
      return {
        activeWorkflowCount: 0,
        recentCompletedRunCount: 0,
        recentFailedRunCount: 0,
        todayRunCount: 0,
        totalWorkflowCount: 0,
        yesterdayRunCount: 0,
      };
    }
    const today = toWorkflowMetricDate(input.today);
    const windowStart = toWorkflowMetricDate(input.windowStart);
    const yesterday = toWorkflowMetricDate(input.yesterday);
    if (input.workflowTypes === undefined) {
      const [dailyMetric, definitionMetric] = await Promise.all([
        this.db.selectFrom("xy_wap_embed_workflow_daily_metric")
          .select([
            sql<number>`COALESCE(SUM(completed_count), 0)`.as("recent_completed_run_count"),
            sql<number>`COALESCE(SUM(failed_count), 0)`.as("recent_failed_run_count"),
            sql<number>`COALESCE(SUM(CASE WHEN metric_date = ${today} THEN entered_count ELSE 0 END), 0)`.as("today_run_count"),
            sql<number>`COALESCE(SUM(CASE WHEN metric_date = ${yesterday} THEN entered_count ELSE 0 END), 0)`.as("yesterday_run_count"),
          ])
          .where("uid", "=", input.uid)
          .where("metric_date", ">=", windowStart)
          .where("metric_date", "<=", today)
          .executeTakeFirst(),
        this.db.selectFrom("xy_wap_embed_workflow_definition")
          .select([
            sql<number>`COALESCE(SUM(runtime_status = 'active'), 0)`.as("active_workflow_count"),
            sql<number>`COUNT(*)`.as("total_workflow_count"),
          ])
          .where("uid", "=", input.uid)
          .where("biz_status", "=", 1)
          .executeTakeFirst(),
      ]);
      return {
        activeWorkflowCount: Number(definitionMetric?.active_workflow_count ?? 0),
        recentCompletedRunCount: Number(dailyMetric?.recent_completed_run_count ?? 0),
        recentFailedRunCount: Number(dailyMetric?.recent_failed_run_count ?? 0),
        todayRunCount: Number(dailyMetric?.today_run_count ?? 0),
        totalWorkflowCount: Number(definitionMetric?.total_workflow_count ?? 0),
        yesterdayRunCount: Number(dailyMetric?.yesterday_run_count ?? 0),
      };
    }
    const workflowTypes = input.workflowTypes.map(encodeWorkflowType);
    const dailyQuery = this.db.selectFrom("xy_wap_embed_workflow_daily_metric as metric")
        .innerJoin("xy_wap_embed_workflow_definition as definition", join => join
          .onRef("definition.uid", "=", "metric.uid")
          .onRef("definition.id", "=", "metric.workflow_id"))
        .select([
          sql<number>`COALESCE(SUM(completed_count), 0)`.as("recent_completed_run_count"),
          sql<number>`COALESCE(SUM(failed_count), 0)`.as("recent_failed_run_count"),
          sql<number>`COALESCE(SUM(CASE WHEN metric_date = ${today} THEN entered_count ELSE 0 END), 0)`
            .as("today_run_count"),
          sql<number>`COALESCE(SUM(CASE WHEN metric_date = ${yesterday} THEN entered_count ELSE 0 END), 0)`
            .as("yesterday_run_count"),
        ])
        .where("metric.uid", "=", input.uid)
        .where("metric.metric_date", ">=", windowStart)
        .where("metric.metric_date", "<=", today)
        .where("definition.workflow_type", "in", workflowTypes);
    const definitionQuery = this.db.selectFrom("xy_wap_embed_workflow_definition")
        .select([
          sql<number>`COALESCE(SUM(runtime_status = 'active'), 0)`.as("active_workflow_count"),
          sql<number>`COUNT(*)`.as("total_workflow_count"),
        ])
        .where("uid", "=", input.uid)
        .where("biz_status", "=", 1)
        .where("workflow_type", "in", workflowTypes);
    const [dailyMetric, definitionMetric] = await Promise.all([
      dailyQuery.executeTakeFirst(),
      definitionQuery.executeTakeFirst(),
    ]);
    return {
      activeWorkflowCount: Number(definitionMetric?.active_workflow_count ?? 0),
      recentCompletedRunCount: Number(dailyMetric?.recent_completed_run_count ?? 0),
      recentFailedRunCount: Number(dailyMetric?.recent_failed_run_count ?? 0),
      todayRunCount: Number(dailyMetric?.today_run_count ?? 0),
      totalWorkflowCount: Number(definitionMetric?.total_workflow_count ?? 0),
      yesterdayRunCount: Number(dailyMetric?.yesterday_run_count ?? 0),
    };
  }

  async getOverview(input: Parameters<WorkflowDataReader["getOverview"]>[0]): Promise<WorkflowDataOverview> {
    if (input.workflowTypes?.length === 0) {
      throw new NotFoundError("WORKFLOW_NOT_FOUND", "Workflow 不存在");
    }
    let definitionQuery = this.db.selectFrom("xy_wap_embed_workflow_definition")
      .select("published_revision")
      .where("uid", "=", input.uid)
      .where("id", "=", input.workflowId)
      .where("biz_status", "=", 1);
    if (input.workflowTypes) {
      definitionQuery = definitionQuery.where("workflow_type", "in", input.workflowTypes.map(encodeWorkflowType));
    }
    const definition = await definitionQuery.executeTakeFirst();
    if (!definition) {
      throw new NotFoundError("WORKFLOW_NOT_FOUND", "Workflow 不存在");
    }
    if (!definition.published_revision) {
      throw new NotFoundError("WORKFLOW_REVISION_NOT_FOUND", "Workflow 尚未发布");
    }
    const revision = await this.db.selectFrom("xy_wap_embed_workflow_revision")
      .select("draft_json")
      .where("uid", "=", input.uid)
      .where("workflow_id", "=", input.workflowId)
      .where("revision", "=", definition.published_revision)
      .executeTakeFirst();
    if (!revision) throw new NotFoundError("WORKFLOW_REVISION_NOT_FOUND", "Workflow Revision 不存在");
    const currentNodeIds = readNodeIds(revision.draft_json);
    const metricScope = () => this.db.selectFrom("xy_wap_embed_workflow_node_metric")
      .where("uid", "=", input.uid)
      .where("workflow_id", "=", input.workflowId);
    const summaryQuery = metricScope().select([
      sql<number | null>`SUM(completed_count)`.as("completed_count"),
      sql<number | null>`SUM(current_count)`.as("current_count"),
      sql<number | null>`SUM(entered_count)`.as("entered_count"),
      sql<number | null>`SUM(incomplete_count)`.as("incomplete_count"),
      sql<string | null>`NULL`.as("node_id"),
      sql<number>`0`.as("passed_count"),
      sql<"summary" | "node">`'summary'`.as("row_kind"),
      sql<Date | null>`MAX(update_time)`.as("update_time"),
    ]);
    const rows = currentNodeIds.size === 0
      ? await summaryQuery.execute()
      : await summaryQuery.unionAll(metricScope().select([
          sql<number>`SUM(completed_count)`.as("completed_count"),
          sql<number>`SUM(current_count)`.as("current_count"),
          sql<number>`SUM(entered_count)`.as("entered_count"),
          sql<number>`SUM(incomplete_count)`.as("incomplete_count"),
          "node_id",
          sql<number>`SUM(passed_count)`.as("passed_count"),
          sql<"summary" | "node">`'node'`.as("row_kind"),
          sql<Date | null>`NULL`.as("update_time"),
        ])
          .where("node_id", "in", [...currentNodeIds])
          .groupBy("node_id"))
        .execute();
    const summaryRow = rows.find(row => row.row_kind === "summary");
    const nodeRows = rows.filter((row): row is typeof row & { node_id: string } => (
      row.row_kind === "node" && row.node_id !== null
    ));
    const calculatedAt = summaryRow?.update_time ? toDate(summaryRow.update_time) : new Date();
    return {
      calculatedAt: calculatedAt.toISOString(),
      nodes: nodeRows.map(row => ({
        completed: Number(row.completed_count),
        current: Number(row.current_count),
        entered: Number(row.entered_count),
        incomplete: Number(row.incomplete_count),
        nodeId: row.node_id,
        passed: Number(row.passed_count),
      })),
      publishedRevision: definition.published_revision,
      summary: {
        completed: Number(summaryRow?.completed_count ?? 0),
        current: Number(summaryRow?.current_count ?? 0),
        entered: Number(summaryRow?.entered_count ?? 0),
        incomplete: Number(summaryRow?.incomplete_count ?? 0),
      },
    };
  }

  async listRecords(input: Parameters<WorkflowDataReader["listRecords"]>[0]): Promise<WorkflowEntryRecordPage> {
    if (input.workflowTypes) await this.requireVisibleWorkflow(input as Required<typeof input>);
    let query = this.db.selectFrom("xy_wap_embed_workflow_run")
      .select([
        "create_time",
        "current_node_id",
        "id",
        "next_execute_at",
        "revision",
        "status",
        "subject_id",
        "subject_type",
        "update_time",
      ])
      .where("uid", "=", input.uid)
      .where("workflow_id", "=", input.workflowId)
      .where(eb => eb.or([
        eb("status", "in", ["queued", "running", "waiting"]),
        eb("completed_at", ">=", sql<Date>`CURRENT_TIMESTAMP - INTERVAL ${WORKFLOW_RUN_RETENTION_DAYS} DAY`),
      ]))
      .orderBy("id", "desc")
      .limit(input.limit + 1);
    if (input.cursor) query = query.where("id", "<", input.cursor);
    if (input.nodeId) query = query.where("current_node_id", "=", input.nodeId);
    if (input.status) query = query.where("status", "=", input.status);
    const rows = await query.execute();
    const pageRows = rows.slice(0, input.limit);
    const subjects = await this.loadSubjects(input.uid, pageRows.map((row) => ({
      subjectId: row.subject_id,
      subjectType: decodeWorkflowSubjectType(row.subject_type),
    })));
    return {
      items: pageRows.map(row => ({
        createdAt: toDate(row.create_time).toISOString(),
        currentNodeId: row.current_node_id,
        customer: subjects.get(subjectKey(
          decodeWorkflowSubjectType(row.subject_type),
          row.subject_id,
        )) ?? { avatar: null, name: "未知客户" },
        nextExecuteAt: row.next_execute_at ? toDate(row.next_execute_at).toISOString() : null,
        recordId: String(row.id),
        revision: row.revision,
        status: parseStatus(row.status),
        subjectType: decodeWorkflowSubjectType(row.subject_type),
        updatedAt: toDate(row.update_time).toISOString(),
      })),
      nextCursor: rows.length > pageRows.length ? String(pageRows.at(-1)!.id) : null,
    };
  }

  async getRecord(input: Parameters<WorkflowDataReader["getRecord"]>[0]): Promise<WorkflowEntryRecordDetail> {
    if (input.workflowTypes) await this.requireVisibleWorkflow(input as Required<typeof input>);
    const run = await this.db.selectFrom("xy_wap_embed_workflow_run")
      .select([
        "create_time",
        "current_node_id",
        "id",
        "next_execute_at",
        "revision",
        "status",
        "subject_id",
        "subject_type",
        "terminal_reason",
        "update_time",
      ])
      .where("uid", "=", input.uid)
      .where("workflow_id", "=", input.workflowId)
      .where("id", "=", input.recordId)
      .where(eb => eb.or([
        eb("status", "in", ["queued", "running", "waiting"]),
        eb("completed_at", ">=", sql<Date>`CURRENT_TIMESTAMP - INTERVAL ${WORKFLOW_RUN_RETENTION_DAYS} DAY`),
      ]))
      .executeTakeFirst();
    if (!run) throw new NotFoundError("WORKFLOW_RECORD_NOT_FOUND", "运行记录不存在");
    const [executions, customers] = await Promise.all([
      this.db.selectFrom("xy_wap_embed_workflow_node_execution")
        .select(["completed_at", "create_time", "error_message", "node_id", "node_kind", "revision", "status"])
        .where("uid", "=", input.uid)
        .where("run_id", "=", input.recordId)
        .where("status", "in", ["completed", "failed"])
        .orderBy("sequence", "asc")
        .execute(),
      this.loadSubjects(input.uid, [{
        subjectId: run.subject_id,
        subjectType: decodeWorkflowSubjectType(run.subject_type),
      }]),
    ]);
    const revisionNumbers = [...new Set([...executions.map(row => row.revision), run.revision])];
    const revisions = await this.db.selectFrom("xy_wap_embed_workflow_revision")
      .select(["draft_json", "revision"])
      .where("uid", "=", input.uid)
      .where("workflow_id", "=", input.workflowId)
      .where("revision", "in", revisionNumbers)
      .execute();
    const titlesByRevision = new Map(revisions.map(item => [
      item.revision,
      readNodeTitles(item.draft_json),
    ]));
    const steps: WorkflowEntryRecordDetail["steps"] = executions.map(row => {
      const nodeKind = parseRecordNodeKind(row.node_kind);
      const metadata = titlesByRevision.get(row.revision)?.get(row.node_id);
      return {
        ...(row.error_message ? { description: row.error_message } : {}),
        occurredAt: toDate(row.completed_at ?? row.create_time).toISOString(),
        nodeId: row.node_id,
        nodeKind,
        revision: row.revision,
        status: row.status === "failed" ? "failed" : "completed",
        title: metadata?.title ?? fallbackNodeTitle(nodeKind),
      };
    });
    if (run.status === "queued" || run.status === "running" || run.status === "waiting") {
      const metadata = titlesByRevision.get(run.revision)?.get(run.current_node_id);
      const previousStep = steps.at(-1)?.nodeId === run.current_node_id ? steps.at(-1) : undefined;
      const currentKind = metadata?.kind ?? previousStep?.nodeKind ?? "unknown";
      const currentStep = {
        ...(run.status === "waiting" && run.next_execute_at
          ? { nextExecuteAt: toDate(run.next_execute_at).toISOString() }
          : {}),
        occurredAt: toDate(run.update_time).toISOString(),
        nodeId: run.current_node_id,
        nodeKind: currentKind,
        revision: run.revision,
        status: run.status === "waiting" ? "waiting" as const : "current" as const,
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
      customer: customers.get(subjectKey(
        decodeWorkflowSubjectType(run.subject_type),
        run.subject_id,
      )) ?? { avatar: null, name: "未知客户" },
      recordId: String(run.id),
      revision: run.revision,
      status: parseStatus(run.status),
      subjectType: decodeWorkflowSubjectType(run.subject_type),
      terminalReason: parseFlowChangedReason(run.terminal_reason),
      steps,
    };
  }

  private async requireVisibleWorkflow(input: {
    uid: number;
    workflowId: string;
    workflowTypes: WorkflowType[];
  }) {
    if (input.workflowTypes.length === 0) {
      throw new NotFoundError("WORKFLOW_NOT_FOUND", "Workflow 不存在");
    }
    let definitionQuery = this.db.selectFrom("xy_wap_embed_workflow_definition")
      .select("id")
      .where("uid", "=", input.uid)
      .where("id", "=", input.workflowId)
      .where("biz_status", "=", 1);
    definitionQuery = definitionQuery.where("workflow_type", "in", input.workflowTypes.map(encodeWorkflowType));
    const definition = await definitionQuery.executeTakeFirst();
    if (!definition) throw new NotFoundError("WORKFLOW_NOT_FOUND", "Workflow 不存在");
  }

  private async loadSubjects(
    uid: number,
    subjects: Array<{
      subjectId: string;
      subjectType: ReturnType<typeof decodeWorkflowSubjectType>;
    }>,
  ) {
    // TODO: Resolve wecom_contact through the Java subject resolver once that contract is available.
    const ids = [...new Set(subjects
      .filter((subject) => subject.subjectType === "chatai_contact")
      .map((subject) => subject.subjectId))];
    if (ids.length === 0) return new Map<string, { avatar: string | null; name: string }>();
    const rows = await this.db.selectFrom("xy_wap_embed_contact")
      .select(["avatar", "name", "real_name", "third_external_userid"])
      .where("uid", "=", uid)
      .where("platform", "=", CURRENT_WORKBENCH_PLATFORM)
      .where("third_external_userid", "in", ids)
      .where("biz_status", "=", 1)
      .execute();
    return new Map(rows.map(row => [subjectKey("chatai_contact", row.third_external_userid), {
      avatar: row.avatar?.trim() || null,
      name: row.real_name?.trim() || row.name?.trim() || "未知客户",
    }]));
  }
}

function toWorkflowMetricDate(value: string) {
  return new Date(`${value}T00:00:00+08:00`);
}

function subjectKey(subjectType: ReturnType<typeof decodeWorkflowSubjectType>, subjectId: string) {
  return `${subjectType}:${subjectId}`;
}

function parseStatus(value: string): WorkflowEntryRecordStatus {
  if (["queued", "running", "waiting", "completed", "failed", "cancelled"].includes(value)) {
    return value as WorkflowEntryRecordStatus;
  }
  throw new Error(`Unknown workflow record status: ${value}`);
}

function parseKnownNodeKind(value: string): WorkflowNodeKind | null {
  if ([
    "start",
    "wait",
    "wait-event",
    "branch",
    "message",
    "message-query",
    "tag",
    "coupon",
    "handoff",
    "agent",
    "llm",
    "order-bind",
    "order-query",
    "order-conversion",
    "ratio-split",
    "tag-query",
    "customer-update",
    "ai-collect",
    "ai-intent",
    "audience-filter",
    "end",
  ].includes(value)) {
    return value as WorkflowNodeKind;
  }
  return null;
}

function parseRecordNodeKind(value: string): WorkflowEntryRecordStepNodeKind {
  return parseKnownNodeKind(value) ?? "unknown";
}

function parseFlowChangedReason(value: string | null): WorkflowFlowChangedReason | null {
  return Value.Check(WorkflowFlowChangedReasonSchema, value)
    ? value as WorkflowFlowChangedReason
    : null;
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

function readNodeIds(value: unknown) {
  return new Set(readDraftNodes(value).flatMap(node =>
    node && typeof node === "object" && "id" in node && typeof node.id === "string"
      ? [node.id]
      : []));
}

function readDraftNodes(value: unknown): unknown[] {
  let draft = value;
  if (typeof value === "string") {
    try {
      draft = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return draft && typeof draft === "object" && "nodes" in draft && Array.isArray(draft.nodes)
    ? draft.nodes
    : [];
}

function fallbackNodeTitle(kind: WorkflowEntryRecordStepNodeKind) {
  const titles = {
    agent: "转 Agent",
    "ai-collect": "资料收集",
    "ai-intent": "意图识别",
    "audience-filter": "人群筛选",
    branch: "条件分支",
    coupon: "发券",
    "customer-update": "修改客户资料",
    end: "结束",
    handoff: "转人工",
    llm: "大模型",
    message: "消息发送",
    "message-query": "消息查询",
    "order-bind": "关联订单",
    "order-query": "订单查询",
    "order-conversion": "代客转积分",
    "ratio-split": "A/B 分流",
    start: "开始",
    tag: "客户打标",
    "tag-query": "标签查询",
    unknown: "未知节点",
    wait: "等待",
    "wait-event": "等待事件",
  } satisfies Record<WorkflowEntryRecordStepNodeKind, string>;
  return titles[kind];
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}
