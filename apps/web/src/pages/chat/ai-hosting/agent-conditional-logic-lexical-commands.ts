import { createCommand } from "lexical";

export const INSERT_CONDITIONAL_LOGIC_KNOWLEDGE_BASE_COMMAND = createCommand<string>(
  "INSERT_CONDITIONAL_LOGIC_KNOWLEDGE_BASE_COMMAND",
);

export const RESTORE_CONDITIONAL_LOGIC_SEGMENTS_COMMAND = createCommand<
  import("./agent-settings.constants").ConditionalLogicSegment[]
>("RESTORE_CONDITIONAL_LOGIC_SEGMENTS_COMMAND");
