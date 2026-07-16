import type {
  AiHostingAgentPromptConfig,
  AiHostingAgentTestRequest,
  AiHostingAgentTestResponse,
} from "@chatai/contracts";
import type { Kysely } from "kysely";
import type { Database } from "../../db/schema.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import type { WorkbenchJavaClient } from "../chat/workbench-java-client.js";
import { hydrateAgentTestAttachmentReplies } from "./agent-test-attachment-resolver.js";
import { mapJavaAgentTestResponse } from "./agent-test-mappers.js";

const AGENT_TEST_MESSAGE_LIMIT = 20;

export class AgentTestService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly javaClient: WorkbenchJavaClient,
  ) {}

  async testAgent(
    subUserId: string,
    request: AiHostingAgentTestRequest,
  ): Promise<AiHostingAgentTestResponse> {
    const uid = await this.resolveUid(subUserId);
    const modelId = parseModelId(request.modelId);

    await this.assertModelAvailable(uid, modelId);

    const response = await this.javaClient.testAgent({
      messages: request.messages.slice(-AGENT_TEST_MESSAGE_LIMIT).map((message) => ({
        contents: message.contents.map((content) => ({
          ...(content.text ? { text: content.text } : {}),
          type: content.type,
          ...(content.url ? { url: content.url } : {}),
        })),
        role: message.role,
      })),
      modelId,
      promptConfig: serializePromptConfig(request.promptConfig),
      uid,
    });

    const mapped = mapJavaAgentTestResponse(response);
    const reply = await hydrateAgentTestAttachmentReplies(this.db, uid, mapped.reply);

    return {
      ...mapped,
      reply,
    };
  }

  private async resolveUid(subUserId: string) {
    const numericSubUserId = Number(subUserId);

    if (!Number.isSafeInteger(numericSubUserId)) {
      throw new NotFoundError("SUB_USER_NOT_FOUND", "账号不存在");
    }

    const subUser = await this.db
      .selectFrom("xy_wap_embed_sub_user")
      .select(["id", "uid"])
      .where("id", "=", numericSubUserId)
      .where("status", "=", 1)
      .executeTakeFirst();

    if (subUser?.uid == null) {
      throw new NotFoundError("SUB_USER_NOT_FOUND", "账号不存在");
    }

    return subUser.uid;
  }

  private async assertModelAvailable(uid: number, modelId: number) {
    const model = await this.db
      .selectFrom("xy_wap_embed_ai_model")
      .select(["id"])
      .where("id", "=", modelId)
      .where("status", "=", 1)
      .where("uid", "in", [uid, 0])
      .executeTakeFirst();

    if (!model) {
      throw new BadRequestError("MODEL_NOT_FOUND", "模型不存在");
    }
  }
}

function parseModelId(value: string) {
  if (!/^\d+$/.test(value)) {
    throw new BadRequestError("MODEL_NOT_FOUND", "模型不存在");
  }

  const modelId = Number(value);
  if (!Number.isSafeInteger(modelId)) {
    throw new BadRequestError("MODEL_NOT_FOUND", "模型不存在");
  }

  return modelId;
}

function serializePromptConfig(promptConfig: AiHostingAgentPromptConfig) {
  return JSON.stringify({
    available_kb_ids: promptConfig.availableKbIds,
    condition_logic: promptConfig.conditionLogic,
    handoff_rules: promptConfig.handoffRules,
    reply_style: {
      length: promptConfig.replyStyle.length,
      style_instruction: promptConfig.replyStyle.styleInstruction,
    },
    role: promptConfig.role,
  });
}
