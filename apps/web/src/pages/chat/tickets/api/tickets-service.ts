import type {
  ApiSuccessEnvelope,
  ConversationTicketsQuery,
  ConversationTicketsResponse,
  TicketActivityListQuery,
  TicketActivityPage,
  TicketAssigneeOptionsResponse,
  TicketClaimResponse,
  TicketCommentRequest,
  TicketCommentResponse,
  TicketContextOptionsQuery,
  TicketContextOptionsResponse,
  TicketContextQuery,
  TicketContextResponse,
  TicketCountsResponse,
  TicketCreateRequest,
  TicketCreateResponse,
  TicketDeleteResponse,
  TicketDetailResponse,
  TicketListQuery,
  TicketListResponse,
  TicketUpdateRequest,
  TicketUpdateResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export async function getTickets(query: TicketListQuery = {}) {
  const response = await http.get<ApiSuccessEnvelope<TicketListResponse>>("/server/tickets", {
    params: compactQuery(query),
  });
  return response.data;
}

export async function getTicketCounts() {
  const response = await http.get<ApiSuccessEnvelope<TicketCountsResponse>>("/server/tickets/counts");
  return response.data;
}

export async function getTicketContextOptions(query: TicketContextOptionsQuery) {
  const response = await http.get<ApiSuccessEnvelope<TicketContextOptionsResponse>>(
    "/server/tickets/context-options",
    { params: compactQuery(query) },
  );
  return response.data;
}

export async function getConversationTickets(
  conversationId: string,
  query: ConversationTicketsQuery = {},
) {
  const response = await http.get<ApiSuccessEnvelope<ConversationTicketsResponse>>(
    `/server/tickets/by-conversation/${encodeURIComponent(conversationId)}`,
    { params: compactQuery(query) },
  );
  return response.data;
}

export async function getTicketDetail(ticketId: string) {
  const response = await http.get<ApiSuccessEnvelope<TicketDetailResponse>>(
    `/server/tickets/${encodeURIComponent(ticketId)}`,
  );
  return response.data;
}

export async function getTicketActivities(
  ticketId: string,
  query: TicketActivityListQuery = {},
) {
  const response = await http.get<ApiSuccessEnvelope<TicketActivityPage>>(
    `/server/tickets/${encodeURIComponent(ticketId)}/activities`,
    { params: compactQuery(query) },
  );
  return response.data;
}

export async function getTicketAssigneeOptions(ticketId: string) {
  const response = await http.get<ApiSuccessEnvelope<TicketAssigneeOptionsResponse>>(
    `/server/tickets/${encodeURIComponent(ticketId)}/assignee-options`,
  );
  return response.data;
}

export async function getTicketContext(ticketId: string, query: TicketContextQuery = {}) {
  const response = await http.get<ApiSuccessEnvelope<TicketContextResponse>>(
    `/server/tickets/${encodeURIComponent(ticketId)}/context`,
    { params: compactQuery(query) },
  );
  return response.data;
}

export async function createTicket(payload: TicketCreateRequest) {
  const response = await http.post<ApiSuccessEnvelope<TicketCreateResponse>>(
    "/server/tickets",
    payload,
  );
  return response.data;
}

export async function updateTicket(ticketId: string, payload: TicketUpdateRequest) {
  const response = await http.patch<ApiSuccessEnvelope<TicketUpdateResponse>>(
    `/server/tickets/${encodeURIComponent(ticketId)}`,
    payload,
  );
  return response.data;
}

export async function deleteTicket(ticketId: string) {
  const response = await http.delete<ApiSuccessEnvelope<TicketDeleteResponse>>(
    `/server/tickets/${encodeURIComponent(ticketId)}`,
  );
  return response.data;
}

export async function claimTicket(ticketId: string) {
  const response = await http.post<ApiSuccessEnvelope<TicketClaimResponse>>(
    `/server/tickets/${encodeURIComponent(ticketId)}/claim`,
  );
  return response.data;
}

export async function addTicketComment(ticketId: string, payload: TicketCommentRequest) {
  const response = await http.post<ApiSuccessEnvelope<TicketCommentResponse>>(
    `/server/tickets/${encodeURIComponent(ticketId)}/comments`,
    payload,
  );
  return response.data;
}

function compactQuery<T extends object>(query: T) {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== ""),
  );
}
