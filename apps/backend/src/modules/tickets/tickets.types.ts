import type {
  TicketContextOptionsResponse,
  TicketListQuery,
  TicketPriority,
  TicketSourceType,
  TicketView,
} from "@chatai/contracts";
import type { InsightMessageSourceRow } from "../insights/insights.types.js";

export type TicketRepositoryView = TicketView | "visible";

export type TicketRecord = {
  anchorMessageId: string | null;
  assigneeDisplayName: string | null;
  assigneeSubUserId: string | null;
  canceledAt: number | null;
  completedAt: number | null;
  conversationId: string;
  createdAt: number;
  createdByDisplayName: string | null;
  createdBySubUserId: string | null;
  customerAvatarUrl: string | null;
  customerName: string;
  description: string | null;
  dueAt: number | null;
  dueHint: string | null;
  hasAccountAccess: boolean;
  ownerAccountAvatarUrl: string | null;
  ownerAccountId: string;
  ownerAccountName: string;
  overdue: boolean;
  priority: TicketPriority;
  sessionId: string | null;
  snapshotId: string | null;
  sourceType: TicketSourceType;
  status: string;
  ticketId: string;
  title: string;
  updatedAt: number;
};

export type TicketRecordPage = {
  items: TicketRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type TicketListRepositoryInput = Omit<TicketListQuery, "assigneeSubUserId" | "ownerAccountId" | "view"> & {
  assigneeSubUserId?: number;
  conversationIds?: number[];
  globalAccess: boolean;
  ownerAccountId?: number;
  page: number;
  pageSize: number;
  subUserId: number;
  ticketIds?: number[];
  uid: number;
  view: TicketRepositoryView;
};

export type TicketCountRepositoryInput = Pick<
  TicketListRepositoryInput,
  "conversationIds" | "globalAccess" | "subUserId" | "uid" | "view"
> & {
  statuses?: string[];
};

export type TicketConversationIdentity = {
  chatType: number;
  conversationId: number;
  platform: number;
  thirdExternalUserId: string;
  thirdUserId: string;
};

export type TicketSessionOptionPage = TicketContextOptionsResponse["sessions"];

export type TicketMessageCandidate = InsightMessageSourceRow;
