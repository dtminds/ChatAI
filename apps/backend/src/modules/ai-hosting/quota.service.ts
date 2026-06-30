import type { AiHostingQuotaOverview } from "@chatai/contracts";
import {
  AI_HOSTING_AGENT_QUOTA_LIMIT,
  AI_HOSTING_KB_DOC_STORAGE_QUOTA_LIMIT,
  AI_HOSTING_KB_QUOTA_LIMIT,
} from "@chatai/contracts";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../db/schema.js";

const dbActiveStatus = 1;

export class AiHostingQuotaService {
  constructor(private readonly db: Kysely<Database>) {}

  async getQuotaOverview(uid: number): Promise<AiHostingQuotaOverview> {
    const [agentUsed, kbUsed, kbDocStorageUsed] = await Promise.all([
      this.countAgents(uid),
      this.countKbs(uid),
      this.sumKbDocStorageBytes(uid),
    ]);

    return {
      agents: {
        limit: AI_HOSTING_AGENT_QUOTA_LIMIT,
        used: agentUsed,
      },
      kbDocs: {
        limit: AI_HOSTING_KB_DOC_STORAGE_QUOTA_LIMIT,
        used: kbDocStorageUsed,
      },
      kbs: {
        limit: AI_HOSTING_KB_QUOTA_LIMIT,
        used: kbUsed,
      },
    };
  }

  async sumKbDocStorageBytes(uid: number) {
    const result = await this.db
      .selectFrom("xy_wap_embed_agent_kb_doc")
      .select(sql<number>`coalesce(sum(doc_size), 0)`.as("used"))
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    return Number(result?.used ?? 0);
  }

  private async countAgents(uid: number) {
    const result = await this.db
      .selectFrom("xy_wap_embed_agent as agent")
      .select(({ fn }) => fn.count<number>("agent.id").as("total"))
      .where("agent.uid", "=", uid)
      .where("agent.status", "=", dbActiveStatus)
      .executeTakeFirst();

    return Number(result?.total ?? 0);
  }

  private async countKbs(uid: number) {
    const result = await this.db
      .selectFrom("xy_wap_embed_agent_kb")
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .where("uid", "=", uid)
      .where("status", "=", dbActiveStatus)
      .executeTakeFirst();

    return Number(result?.total ?? 0);
  }
}

export function createAiHostingQuotaService(db: Kysely<Database>) {
  return new AiHostingQuotaService(db);
}
