import type { SkillResourceItem } from "./ai-skill-resource";

/** 从技能广场预览带入「新增技能」页的草稿 */
export type SkillCreateDraft = {
  applyScene?: string;
  content: string;
  name?: string;
  resources?: {
    "knowledge-bases": SkillResourceItem[];
    tools: SkillResourceItem[];
    variables: SkillResourceItem[];
  };
};

export const SKILL_CREATE_DRAFT_STATE_KEY = "skillCreateDraft";
