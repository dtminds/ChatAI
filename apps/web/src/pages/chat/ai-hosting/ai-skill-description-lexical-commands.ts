import { createCommand } from "lexical";
import type { SkillContentResourceSegment, SkillContentSegment } from "./ai-skill-resource";

export const INSERT_SKILL_CONTENT_RESOURCE_COMMAND =
  createCommand<SkillContentResourceSegment>("INSERT_SKILL_CONTENT_RESOURCE_COMMAND");

export const RESTORE_SKILL_CONTENT_SEGMENTS_COMMAND = createCommand<SkillContentSegment[]>(
  "RESTORE_SKILL_CONTENT_SEGMENTS_COMMAND",
);
