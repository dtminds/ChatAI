import type {
  WorkbenchSearchContactResultDto,
  WorkbenchSearchGroupResultDto,
  WorkbenchSearchResponseDto,
} from "@chatai/contracts";
import type { Conversation } from "@/pages/chat/chat-types";

export function searchLocalConversations(
  conversations: Conversation[],
  keyword: string,
): WorkbenchSearchResponseDto {
  const normalizedKeyword = normalizeSearchText(keyword);

  if (!normalizedKeyword) {
    return { contacts: [], groups: [] };
  }

  const contacts: WorkbenchSearchContactResultDto[] = [];
  const groups: WorkbenchSearchGroupResultDto[] = [];
  const seenContactIds = new Set<string>();
  const seenGroupIds = new Set<string>();

  for (const conversation of conversations) {
    if (!matchesConversation(conversation, normalizedKeyword)) {
      continue;
    }

    if (conversation.mode === "group") {
      const thirdGroupId = conversation.thirdGroupId?.trim();

      if (!thirdGroupId || seenGroupIds.has(thirdGroupId)) {
        continue;
      }

      seenGroupIds.add(thirdGroupId);
      groups.push(mapLocalGroupResult(conversation, thirdGroupId));
      continue;
    }

    const thirdExternalUserId = conversation.thirdExternalUserId?.trim();

    if (!thirdExternalUserId || seenContactIds.has(thirdExternalUserId)) {
      continue;
    }

    seenContactIds.add(thirdExternalUserId);
    contacts.push(mapLocalContactResult(conversation, thirdExternalUserId));
  }

  return { contacts, groups };
}

export function mergeConversationSearchResults(
  localResults: WorkbenchSearchResponseDto,
  serverResults?: WorkbenchSearchResponseDto | null,
): WorkbenchSearchResponseDto {
  if (!serverResults) {
    return localResults;
  }

  const contactIds = new Set(
    localResults.contacts.map((contact) => contact.thirdExternalUserId),
  );
  const groupIds = new Set(localResults.groups.map((group) => group.thirdGroupId));

  return {
    contacts: [
      ...localResults.contacts,
      ...serverResults.contacts.filter(
        (contact) => !contactIds.has(contact.thirdExternalUserId),
      ),
    ],
    groups: [
      ...localResults.groups,
      ...serverResults.groups.filter((group) => !groupIds.has(group.thirdGroupId)),
    ],
  };
}

function matchesConversation(
  conversation: Conversation,
  normalizedKeyword: string,
) {
  return [
    conversation.customerName,
    conversation.contactOriginalName,
    conversation.groupOriginalName,
  ].some((value) => normalizeSearchText(value).includes(normalizedKeyword));
}

function mapLocalContactResult(
  conversation: Conversation,
  thirdExternalUserId: string,
): WorkbenchSearchContactResultDto {
  const name = conversation.customerName.trim() || "未知客户";

  return {
    avatar: conversation.customerAvatarUrl,
    conversationId: conversation.id,
    name,
    realName: conversation.contactOriginalName?.trim() || name,
    thirdExternalUserId,
  };
}

function mapLocalGroupResult(
  conversation: Conversation,
  thirdGroupId: string,
): WorkbenchSearchGroupResultDto {
  const displayName = conversation.customerName.trim();
  const originalName = conversation.groupOriginalName?.trim();

  return {
    avatar: conversation.customerAvatarUrl,
    conversationId: conversation.id,
    name: originalName || displayName || undefined,
    ...(originalName && displayName && displayName !== originalName
      ? { remark: displayName }
      : {}),
    thirdGroupId,
  };
}

function normalizeSearchText(value: string | null | undefined) {
  return value?.normalize("NFC").toLocaleLowerCase() ?? "";
}
