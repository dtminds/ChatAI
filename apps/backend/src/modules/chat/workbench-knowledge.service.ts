import type {
  WorkbenchKnowledgeConfigRequest,
  WorkbenchKnowledgeDocPageRequest,
  WorkbenchKnowledgeFaqAddRequest,
  WorkbenchKnowledgePageRequest,
} from "@chatai/contracts";
import { BadRequestError } from "../../shared/errors.js";
import { noopLogger, type AppLogger } from "../../shared/logger.js";
import { normalizeKnowledgeId } from "./knowledge-doc-mappers.js";
import { JAVA_KNOWLEDGE_FAQ_SOURCE } from "./knowledge-faq-mappers.js";
import type { WorkbenchAccess } from "./workbench-access.js";
import type { WorkbenchJavaClient } from "./workbench-java-client.js";
import { assertSmartReplySupportedConversation } from "./workbench-smart-reply-scope.js";

export class WorkbenchKnowledgeService {
  constructor(
    private readonly javaClient: WorkbenchJavaClient,
    private readonly access: WorkbenchAccess,
    private readonly logger: AppLogger = noopLogger,
  ) {}

  async listKnowledgePage(
    subUserId: string,
    request: WorkbenchKnowledgePageRequest,
  ) {
    const scope = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.access.getAccessibleConversation(
      subUserId,
      request.conversationId,
      scope,
    );
    assertSmartReplySupportedConversation(conversation);

    const response = await this.javaClient.listKnowledgePage({
      page: 1,
      pageSize: 9999,
      uid: conversation.uid,
    });

    this.logger.info(
      {
        conversationId: request.conversationId,
        list: response.list,
        listLength: response.list.length,
        operation: "list-knowledge-page",
        uid: conversation.uid,
      },
      "知识集列表映射结果",
    );

    return response;
  }

  async getKnowledgeConfig(
    subUserId: string,
    request: WorkbenchKnowledgeConfigRequest,
  ) {
    const scope = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.access.getAccessibleConversation(
      subUserId,
      request.conversationId,
      scope,
    );
    assertSmartReplySupportedConversation(conversation);

    return this.javaClient.getKnowledgeConfig({
      uid: conversation.uid,
    });
  }

  async listKnowledgeDocPage(
    subUserId: string,
    request: WorkbenchKnowledgeDocPageRequest,
  ) {
    const scope = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.access.getAccessibleConversation(
      subUserId,
      request.conversationId,
      scope,
    );
    assertSmartReplySupportedConversation(conversation);

    const knowledgeId = normalizeKnowledgeId(request.knowledgeId);

    if (knowledgeId == null) {
      this.logger.warn(
        {
          conversationId: request.conversationId,
          knowledgeId: request.knowledgeId,
          operation: "list-knowledge-doc-page",
          uid: conversation.uid,
        },
        "知识集 ID 无效",
      );
      throw new BadRequestError("INVALID_KNOWLEDGE_ID", "知识集 ID 无效");
    }

    const response = await this.javaClient.listKnowledgeDocPage({
      knowledgeId,
      page: 1,
      pageSize: 9999,
      uid: conversation.uid,
    });

    this.logger.info(
      {
        conversationId: request.conversationId,
        knowledgeId,
        list: response.list,
        listLength: response.list.length,
        operation: "list-knowledge-doc-page",
        uid: conversation.uid,
      },
      "知识集 FAQ 列表映射结果",
    );

    return response;
  }

  async addKnowledgeFaq(
    subUserId: string,
    request: WorkbenchKnowledgeFaqAddRequest,
  ) {
    const scope = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.access.getAccessibleConversation(
      subUserId,
      request.conversationId,
      scope,
    );
    assertSmartReplySupportedConversation(conversation);

    const docId = normalizeKnowledgeId(request.docId);

    if (docId == null) {
      throw new BadRequestError("INVALID_KNOWLEDGE_DOC_ID", "FAQ ID 无效");
    }

    if (request.list.length === 0) {
      throw new BadRequestError("INVALID_KNOWLEDGE_FAQ_LIST", "FAQ 内容不能为空");
    }

    return this.javaClient.addKnowledgeFaq({
      docId,
      list: request.list.map((item) => ({
        answer: item.answer,
        attachIds: item.attachIds,
        question: item.question,
        similarQuestion: item.similarQuestion,
      })),
      source: JAVA_KNOWLEDGE_FAQ_SOURCE,
      uid: conversation.uid,
    });
  }
}
