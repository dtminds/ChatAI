import type {
  TicketActivity,
  TicketActivityPage,
  TicketContextOptionsResponse,
  TicketListQuery,
  TicketPriority,
  TicketSourceType,
  TicketStatus,
  TicketView,
} from "@chatai/contracts";
import type { InsightMessageSourceRow } from "../insights/insights.types.js";

export type TicketRepositoryView = TicketView | "visible";
export type TicketPersistenceStatus = TicketStatus | "deleted";

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

export type TicketAccessRecord = Pick<TicketRecord,
  | "anchorMessageId"
  | "assigneeSubUserId"
  | "conversationId"
  | "createdBySubUserId"
  | "hasAccountAccess"
  | "sessionId"
  | "sourceType"
  | "ticketId"
>;

export type TicketDeleteRecord = {
  createdBySubUserId: string | null;
  sourceType: TicketSourceType;
  status: TicketPersistenceStatus;
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

export type TicketSessionOptions = TicketContextOptionsResponse["sessions"];

export type TicketMessageCandidate = InsightMessageSourceRow;

export type TicketActivityRecord = Omit<TicketActivity, "operator"> & {
  operatorDisplayName: string | null;
  operatorSubUserId: string | null;
};

export type TicketActivityRecordPage = Omit<TicketActivityPage, "items"> & {
  items: TicketActivityRecord[];
};

export type TicketMutationActivity = {
  activityType: TicketActivity["activityType"] | "deleted";
  content?: string | null;
  detail?: Record<string, unknown> | null;
};
