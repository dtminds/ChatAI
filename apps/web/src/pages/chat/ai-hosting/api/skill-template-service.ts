import type {
  AgentSkillTemplateMarketplaceResponse,
  ApiSuccessEnvelope,
} from "@chatai/contracts";
import { http } from "@/lib/request";

/** 技能广场：只读已上线模版，按有效分组聚合 */
export async function listSkillTemplates() {
  const response = await http.get<
    ApiSuccessEnvelope<AgentSkillTemplateMarketplaceResponse>
  >("/server/ai-hosting/skill-templates");

  return response.data;
}
