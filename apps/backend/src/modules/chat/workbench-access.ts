import { ForbiddenError, NotFoundError, UnauthorizedError } from "../../shared/errors.js";
import type {
  AuthenticatedWorkbenchScope,
  WorkbenchPlatformScope,
} from "../workbench-platform-scope.js";
import type {
  ConversationLookup,
  WorkbenchRepository,
} from "./workbench-repository.js";

export class WorkbenchAccess {
  constructor(
    private readonly repository: WorkbenchRepository,
    private readonly workbenchScope: WorkbenchPlatformScope & { uid?: number },
  ) {}

  async getAuthenticatedWorkbenchScope(
    subUserId: string,
    authenticatedSubUser?: { uid: number },
  ): Promise<AuthenticatedWorkbenchScope> {
    const subUser =
      authenticatedSubUser ?? (await this.repository.getSubUser(subUserId));

    if (!subUser) {
      throw new UnauthorizedError();
    }

    const uid = this.workbenchScope.uid;

    if (uid == null || !Number.isSafeInteger(uid) || uid <= 0) {
      throw new UnauthorizedError();
    }

    return {
      platform: this.workbenchScope.platform,
      uid,
    };
  }

  async assertSeatAccess(
    subUserId: string,
    seatId: string,
    scope: AuthenticatedWorkbenchScope,
  ) {
    const canAccess = await this.repository.canAccessSeat(
      {
        platform: scope.platform,
        subUserId,
        uid: scope.uid,
      },
      seatId,
    );

    if (!canAccess) {
      throw new NotFoundError("SEAT_NOT_FOUND", "席位不存在");
    }
  }

  async getAccessibleConversation(
    subUserId: string,
    conversationId: string,
    scope: AuthenticatedWorkbenchScope,
  ): Promise<ConversationLookup> {
    const conversation = await this.repository.getConversationLookup(conversationId);

    if (!conversation) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    await this.assertSeatAccess(subUserId, conversation.seatId, scope);

    return conversation;
  }

  async getOperableConversation(
    subUserId: string,
    conversationId: string,
    scope: AuthenticatedWorkbenchScope,
  ): Promise<ConversationLookup> {
    const conversation = await this.getAccessibleConversation(
      subUserId,
      conversationId,
      scope,
    );

    if (conversation.seatHostSubUserId !== subUserId) {
      throw new ForbiddenError("SEAT_NOT_TAKEN_OVER", "当前账号尚未由你接管");
    }

    return conversation;
  }
}
