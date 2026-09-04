export type WorkflowWeComMemberSummary = {
  avatarUrl: string;
  id: number;
  name: string;
};

export type WorkflowWeComMemberReader = {
  findByIds(uid: number, workUserIds: number[]): Promise<Map<number, WorkflowWeComMemberSummary>>;
};

export class EmptyWorkflowWeComMemberReader implements WorkflowWeComMemberReader {
  async findByIds(): Promise<Map<number, WorkflowWeComMemberSummary>> {
    return new Map();
  }
}
