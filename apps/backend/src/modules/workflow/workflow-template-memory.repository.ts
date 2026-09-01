import type { WorkflowTemplateRepository, WorkflowTemplateRecord } from "./workflow-template-repository-types.js";

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryWorkflowTemplateRepository implements WorkflowTemplateRepository {
  private records: WorkflowTemplateRecord[] = [];
  private nextId = 1n;

  async create(input: Omit<WorkflowTemplateRecord, "id" | "createdAt" | "updatedAt">) {
    const now = new Date();
    const record = { ...clone(input), id: String(this.nextId++), createdAt: now, updatedAt: now };
    this.records.push(record);
    return clone(record);
  }

  async update(input: Parameters<WorkflowTemplateRepository["update"]>[0]) {
    const record = this.records.find(item => item.id === input.id);
    if (!record) return null;
    Object.assign(record, clone(input), { updatedAt: new Date() });
    return clone(record);
  }

  async find(id: string, status?: WorkflowTemplateRecord["status"]) {
    const record = this.records.find(item => item.id === id && (!status || item.status === status));
    return record ? clone(record) : null;
  }

  async list(input: Parameters<WorkflowTemplateRepository["list"]>[0]) {
    const query = input.query?.trim().toLocaleLowerCase();
    const filtered = this.records.filter(item =>
      (input.status ? item.status === input.status : item.status === "published")
      && (!query || item.name.toLocaleLowerCase().includes(query) || item.description.toLocaleLowerCase().includes(query))
      && (!input.category || item.category === input.category)
      && (!input.scene || item.scene === input.scene)
      && (!input.workflowType || item.workflowType === input.workflowType),
    ).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || Number(b.id) - Number(a.id));
    const candidates = filtered.filter(item => !input.cursor
      || item.updatedAt < input.cursor.updatedAt
      || (item.updatedAt.getTime() === input.cursor.updatedAt.getTime() && Number(item.id) < Number(input.cursor.id))).slice(0, input.limit + 1);
    const items = candidates.slice(0, input.limit).map(clone);
    const last = items.at(-1);
    return { items, nextCursor: candidates.length > items.length && last ? { updatedAt: last.updatedAt, id: last.id } : null, total: filtered.length };
  }
}
