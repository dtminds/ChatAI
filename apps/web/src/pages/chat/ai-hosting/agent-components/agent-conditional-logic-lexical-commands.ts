import { createCommand } from "lexical";

export type InsertConditionalLogicKnowledgeBasePayload = {
  id: string;
  name: string;
};

export const INSERT_CONDITIONAL_LOGIC_KNOWLEDGE_BASE_COMMAND =
  createCommand<InsertConditionalLogicKnowledgeBasePayload>(
    "INSERT_CONDITIONAL_LOGIC_KNOWLEDGE_BASE_COMMAND",
  );

export const RESTORE_CONDITIONAL_LOGIC_SEGMENTS_COMMAND = createCommand<
  import("./agent-settings.constants").ConditionalLogicSegment[]
>("RESTORE_CONDITIONAL_LOGIC_SEGMENTS_COMMAND");
