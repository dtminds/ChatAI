import {
  GROUP_MEMBER_TYPE,
  WORKBENCH_PULL_GROUP_MEMBERS_MAX_ITEMS,
  type WorkbenchGroupMemberDto,
  type WorkbenchKickGroupMemberRequest,
  type WorkbenchKickGroupMemberResponse,
  type WorkbenchPullGroupMembersRequest,
  type WorkbenchPullGroupMembersResponse,
} from "@chatai/contracts";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors.js";
import type { WorkbenchAccess } from "./workbench-access.js";
import type { WorkbenchJavaClient } from "./workbench-java-client.js";
import { parseMySqlId, type WorkbenchRepository } from "./workbench-repository.js";

export class WorkbenchGroupMemberService {
  constructor(
    private readonly repository: WorkbenchRepository,
    private readonly javaClient: WorkbenchJavaClient,
    private readonly access: WorkbenchAccess,
  ) {}

  async getGroupMembers(subUserId: string, conversationId: string) {
    const scope = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    await this.access.getAccessibleConversation(subUserId, conversationId, scope);

    const groupMembers = await this.repository.listGroupMembers(conversationId);

    if (!groupMembers) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    return groupMembers;
  }

  async pullGroupMembers(
    subUserId: string,
    conversationId: string,
    request: WorkbenchPullGroupMembersRequest,
  ): Promise<WorkbenchPullGroupMembersResponse> {
    const contactThirdUserids = uniqueNonEmptyStrings(
      request.contactThirdUserIds ?? [],
    );
    const thirdUserids = uniqueNonEmptyStrings(request.thirdUserIds ?? []);

    if (contactThirdUserids.length === 0 && thirdUserids.length === 0) {
      throw new BadRequestError("CONTACT_REQUIRED", "请选择要邀请的客户或成员");
    }

    if (
      contactThirdUserids.length + thirdUserids.length >
      WORKBENCH_PULL_GROUP_MEMBERS_MAX_ITEMS
    ) {
      throw new BadRequestError(
        "CONTACT_LIMIT",
        `一次最多邀请 ${WORKBENCH_PULL_GROUP_MEMBERS_MAX_ITEMS} 人`,
      );
    }

    const subUserNumericId = parseMySqlId(subUserId);

    if (subUserNumericId == null) {
      throw new NotFoundError("SUB_USER_NOT_FOUND", "子账号不存在");
    }

    const scope = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.access.getOperableConversation(
      subUserId,
      conversationId,
      scope,
    );
    const groupMembers = await this.repository.listGroupMembers(conversationId);

    if (!groupMembers) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    const groupSeatId = parseMySqlId(groupMembers.groupSeatId);

    if (groupSeatId == null) {
      throw new BadRequestError("INVALID_GROUP_SEAT", "群席位无效");
    }

    if (contactThirdUserids.length > 0) {
      const seatThirdUserId = conversation.thirdUserId?.trim();

      if (!seatThirdUserId) {
        throw new ForbiddenError("CUSTOMER_NOT_OWNED", "存在无法邀请的客户");
      }

      const ownedCustomerIds =
        await this.repository.listOwnedCustomerExternalUserIds({
          platform: conversation.platform,
          seatThirdUserId,
          thirdExternalUserIds: contactThirdUserids,
          uid: conversation.uid,
        });

      if (!hasAllRequestedIds(ownedCustomerIds, contactThirdUserids)) {
        throw new ForbiddenError("CUSTOMER_NOT_OWNED", "存在无法邀请的客户");
      }
    }

    if (thirdUserids.length > 0) {
      const ownedEmployeeIds =
        await this.repository.listOwnedEmployeeThirdUserIds({
          platform: conversation.platform,
          thirdUserIds: thirdUserids,
          uid: conversation.uid,
        });

      if (!hasAllRequestedIds(ownedEmployeeIds, thirdUserids)) {
        throw new ForbiddenError("EMPLOYEE_NOT_OWNED", "存在无法邀请的成员");
      }
    }

    await this.javaClient.pullFriendsInGroup({
      ...(contactThirdUserids.length ? { contactThirdUserids } : {}),
      groupSeatId,
      platform: conversation.platform,
      subUserId: subUserNumericId,
      ...(thirdUserids.length ? { thirdUserids } : {}),
      uid: conversation.uid,
    });

    return {
      conversationId: conversation.id,
    };
  }

  async kickGroupMember(
    subUserId: string,
    conversationId: string,
    request: WorkbenchKickGroupMemberRequest,
  ): Promise<WorkbenchKickGroupMemberResponse> {
    const kickOutThirdUserid = request.kickOutThirdUserId.trim();

    if (!kickOutThirdUserid) {
      throw new BadRequestError("MEMBER_REQUIRED", "请选择要移出的成员");
    }

    const subUserNumericId = parseMySqlId(subUserId);

    if (subUserNumericId == null) {
      throw new NotFoundError("SUB_USER_NOT_FOUND", "子账号不存在");
    }

    const scope = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const conversation = await this.access.getOperableConversation(
      subUserId,
      conversationId,
      scope,
    );
    const groupMembers = await this.repository.listGroupMembers(conversationId);

    if (!groupMembers) {
      throw new NotFoundError("CONVERSATION_NOT_FOUND", "会话不存在");
    }

    const groupSeatId = parseMySqlId(groupMembers.groupSeatId);

    if (groupSeatId == null) {
      throw new BadRequestError("INVALID_GROUP_SEAT", "群席位无效");
    }

    const currentMember = findCurrentGroupMember(
      groupMembers.items,
      conversation.thirdUserId,
    );

    if (!canCurrentSeatKickGroupMembers(currentMember)) {
      throw new ForbiddenError("GROUP_KICK_FORBIDDEN", "无权移出群成员");
    }

    const targetMember = groupMembers.items.find(
      (member) => member.thirdUserId.trim() === kickOutThirdUserid,
    );

    if (!targetMember) {
      throw new NotFoundError("GROUP_MEMBER_NOT_FOUND", "群成员不存在");
    }

    if (!canKickGroupMember(targetMember)) {
      throw new ForbiddenError("GROUP_MEMBER_NOT_REMOVABLE", "无法移出该成员");
    }

    await this.javaClient.kickOutOfGroup({
      groupSeatId,
      kickOutThirdUserid,
      platform: conversation.platform,
      subUserId: subUserNumericId,
      uid: conversation.uid,
    });

    return {
      conversationId: conversation.id,
    };
  }
}

function uniqueNonEmptyStrings(values: readonly string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function hasAllRequestedIds(
  ownedIds: readonly string[],
  requestedIds: readonly string[],
) {
  const ownedIdSet = new Set(ownedIds.map((id) => id.trim()).filter(Boolean));
  return requestedIds.every((id) => ownedIdSet.has(id));
}

function findCurrentGroupMember(
  items: WorkbenchGroupMemberDto[],
  currentSeatThirdUserId?: string,
) {
  const normalizedSeatThirdUserId = currentSeatThirdUserId?.trim();

  if (normalizedSeatThirdUserId) {
    const matched = items.find(
      (member) => member.thirdUserId.trim() === normalizedSeatThirdUserId,
    );

    if (matched) {
      return matched;
    }
  }

  return items.find((member) => member.isReceptionAccount);
}

function canCurrentSeatKickGroupMembers(
  member: WorkbenchGroupMemberDto | undefined,
) {
  return (
    member?.type === GROUP_MEMBER_TYPE.OWNER ||
    member?.type === GROUP_MEMBER_TYPE.ADMIN
  );
}

function canKickGroupMember(member: WorkbenchGroupMemberDto) {
  return member.type === GROUP_MEMBER_TYPE.NORMAL && !member.isOpeningAccount;
}
