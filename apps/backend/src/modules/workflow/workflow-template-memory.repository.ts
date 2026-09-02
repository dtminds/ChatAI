import type { WorkflowTemplateRepository, WorkflowTemplateRecord } from "./workflow-template-repository-types.js";

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryWorkflowTemplateRepository implements WorkflowTemplateRepository {
  private records: WorkflowTemplateRecord[] = [];
  private nextId = 1n;

  async create(input: Omit<WorkflowTemplateRecord, "id" | "createdAt" | "updatedAt">) {
    const now = new Date();
    const record = { ...clone(input), sortOrder: input.sortOrder ?? 0, id: String(this.nextId++), createdAt: now, updatedAt: now };
    this.records.push(record);
    return clone(record);
  }

  async deleteDraft(id: string) {
    const index = this.records.findIndex(item => item.id === id && item.status === "draft");
    if (index < 0) return false;
    this.records.splice(index, 1);
    return true;
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
      && (!input.workflowType || item.workflowType === input.workflowType)
      && (!input.tags?.length || input.tags.every(tag => (item.tags ?? []).includes(tag))),
    ).sort((a, b) => b.sortOrder - a.sortOrder || b.updatedAt.getTime() - a.updatedAt.getTime() || Number(b.id) - Number(a.id));
    const items = filtered.slice(input.offset ?? 0, (input.offset ?? 0) + input.limit).map(clone);
    return { items, total: filtered.length };
  }
}
