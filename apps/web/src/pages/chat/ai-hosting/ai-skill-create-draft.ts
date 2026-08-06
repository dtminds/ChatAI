import type {
  SkillRecommendBinding,
  SkillResourceItem,
} from "./ai-skill-resource";

/** 从技能广场预览带入「新增技能」页的草稿 */
export type SkillCreateDraft = {
  applyScene?: string;
  content: string;
  name?: string;
  /** 模版推荐资源，展示在新建页资源管理下方供选择 */
  recommendResources?: readonly SkillRecommendBinding[];
  resources?: {
    "knowledge-bases": SkillResourceItem[];
    tools: SkillResourceItem[];
    variables: SkillResourceItem[];
  };
};

export const SKILL_CREATE_DRAFT_STATE_KEY = "skillCreateDraft";
