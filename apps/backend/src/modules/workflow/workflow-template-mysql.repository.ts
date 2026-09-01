import type { Kysely } from "kysely";
import { decodeWorkflowType, encodeWorkflowType, type WorkflowDatabase } from "@chatai/workflow-runtime";
import type { WorkflowTemplateRepository, WorkflowTemplateRecord } from "./workflow-template-repository-types.js";

const TABLE = "xy_wap_embed_workflow_template" as const;
const json = (v: unknown) => JSON.stringify(v);
const parse = <T>(v: unknown): T => typeof v === "string" ? JSON.parse(v) as T : v as T;

export class MysqlWorkflowTemplateRepository implements WorkflowTemplateRepository {
  constructor(private readonly db: Kysely<WorkflowDatabase>) {}
  async create(input: Omit<WorkflowTemplateRecord, "id" | "createdAt" | "updatedAt">) {
    const result = await this.db.insertInto(TABLE).values({
      uid: 0,
      workflow_type: encodeWorkflowType(input.workflowType),
      name: input.name,
      description: input.description,
      category: input.category,
      scene: input.scene,
      cover_url: input.coverUrl,
      draft_json: json(input.draft),
      configuration_json: json(input.configurationItems),
      template_version: input.templateVersion,
      status: input.status,
    }).executeTakeFirstOrThrow();
    const row = await this.db.selectFrom(TABLE).selectAll().where("id", "=", String(result.insertId)).executeTakeFirstOrThrow();
    return map(row);
  }
  async update(input: Parameters<WorkflowTemplateRepository["update"]>[0]) {
    const result = await this.db.updateTable(TABLE).set({
      name: input.name, description: input.description, category: input.category, scene: input.scene,
      cover_url: input.coverUrl, draft_json: json(input.draft), configuration_json: json(input.configurationItems),
      template_version: input.templateVersion, status: input.status,
    }).where("id", "=", input.id).executeTakeFirst();
    if (!result.numUpdatedRows) return null;
    const row = await this.db.selectFrom(TABLE).selectAll().where("id", "=", input.id).executeTakeFirst();
    return row ? map(row) : null;
  }
  async find(id: string, status?: WorkflowTemplateRecord["status"]) {
    let q = this.db.selectFrom(TABLE).selectAll().where("id", "=", id).where("uid", "=", 0);
    if (status) q = q.where("status", "=", status);
    const row = await q.executeTakeFirst();
    return row ? map(row) : null;
  }
  async list(input: Parameters<WorkflowTemplateRepository["list"]>[0]) {
    let q = this.db.selectFrom(TABLE).selectAll().where("uid", "=", 0);
    q = input.status ? q.where("status", "=", input.status) : q.where("status", "=", "published");
    if (input.workflowType) q = q.where("workflow_type", "=", encodeWorkflowType(input.workflowType));
    if (input.category) q = q.where("category", "=", input.category);
    if (input.scene) q = q.where("scene", "=", input.scene);
    if (input.query) q = q.where(eb => eb.or([eb("name", "like", `%${input.query}%`), eb("description", "like", `%${input.query}%`)]));
    if (input.cursor) q = q.where(eb => eb.or([eb("update_time", "<", input.cursor!.updatedAt), eb.and([eb("update_time", "=", input.cursor!.updatedAt), eb("id", "<", input.cursor!.id)])]));
    const rows = await q.orderBy("update_time", "desc").orderBy("id", "desc").limit(input.limit + 1).execute();
    let countQuery = this.db.selectFrom(TABLE).select(({ fn }) => fn.count<number>("id").as("total")).where("uid", "=", 0).where("status", "=", input.status ?? "published");
    if (input.workflowType) countQuery = countQuery.where("workflow_type", "=", encodeWorkflowType(input.workflowType));
    if (input.category) countQuery = countQuery.where("category", "=", input.category);
    if (input.scene) countQuery = countQuery.where("scene", "=", input.scene);
    if (input.query) countQuery = countQuery.where(eb => eb.or([eb("name", "like", `%${input.query}%`), eb("description", "like", `%${input.query}%`)]));
    const totalRow = await countQuery.executeTakeFirst();
    const items = rows.slice(0, input.limit).map(map);
    const last = items.at(-1);
    return { items, nextCursor: rows.length > items.length && last ? { updatedAt: last.updatedAt, id: last.id } : null, total: Number(totalRow?.total ?? 0) };
  }
}

function map(row: any): WorkflowTemplateRecord {
  return { id: String(row.id), uid: Number(row.uid), workflowType: decodeWorkflowType(Number(row.workflow_type)), name: row.name, description: row.description, category: row.category, scene: row.scene, coverUrl: row.cover_url, draft: parse(row.draft_json), configurationItems: parse(row.configuration_json), templateVersion: Number(row.template_version), status: row.status, createdAt: new Date(row.create_time), updatedAt: new Date(row.update_time) };
}
