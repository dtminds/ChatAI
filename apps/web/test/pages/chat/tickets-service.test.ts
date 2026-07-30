import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { requestInstance } from "@/lib/request";
import {
  addTicketComment,
  claimTicket,
  createTicket,
  deleteTicket,
  getConversationTickets,
  getConversationTicketActiveCount,
  getTicketActivities,
  getTicketAssigneeOptions,
  getTicketContext,
  getTicketContextOptions,
  getTicketCounts,
  getTicketDetail,
  getTickets,
  updateTicket,
} from "@/pages/chat/tickets/api/tickets-service";

const mock = new MockAdapter(requestInstance);

afterEach(() => mock.reset());

describe("tickets service", () => {
  it("uses the public ticket endpoints and preserves query parameters", async () => {
    mock.onGet("/server/tickets").reply((config) => [200, { data: { query: config.params }, success: true }]);
    mock.onGet("/server/tickets/counts").reply(200, { data: { assignedToMeActive: 2 }, success: true });
    mock.onGet("/server/tickets/context-options").reply(200, { data: { assignees: [], sessions: [] }, success: true });
    mock.onGet("/server/tickets/by-conversation/301").reply(200, { data: { items: [] }, success: true });
    mock.onGet("/server/tickets/by-conversation/301/active-count").reply(200, { data: { activeCount: 3 }, success: true });
    mock.onGet("/server/tickets/501").reply(200, { data: { ticket: {} }, success: true });
    mock.onGet("/server/tickets/501/activities").reply((config) => [200, { data: { query: config.params }, success: true }]);
    mock.onGet("/server/tickets/501/assignee-options").reply(200, { data: { items: [] }, success: true });
    mock.onGet("/server/tickets/501/context").reply((config) => [200, { data: { query: config.params }, success: true }]);
    mock.onPost("/server/tickets").reply(200, { data: { ticket: {} }, success: true });
    mock.onPatch("/server/tickets/501").reply(200, { data: { ticket: {} }, success: true });
    mock.onDelete("/server/tickets/501").reply(200, { data: { deleted: true }, success: true });
    mock.onPost("/server/tickets/501/claim").reply(200, { data: { ticket: {} }, success: true });
    mock.onPost("/server/tickets/501/comments").reply(200, { data: { activity: {} }, success: true });

    await expect(getTickets({ page: 2, status: "open", view: "reception" }))
      .resolves.toMatchObject({ query: { page: 2, status: "open", view: "reception" } });
    await getTicketCounts();
    await getTicketContextOptions({ conversationId: "301" });
    await getConversationTickets("301", { filter: "active" });
    await expect(getConversationTicketActiveCount("301")).resolves.toEqual({ activeCount: 3 });
    await getTicketDetail("501");
    await expect(getTicketActivities("501", { beforeActivityId: "601", pageSize: 50 }))
      .resolves.toMatchObject({ query: { beforeActivityId: "601", pageSize: 50 } });
    await getTicketAssigneeOptions("501");
    await expect(getTicketContext("501", { cursor: "cursor-1", pageSize: 50 }))
      .resolves.toMatchObject({ query: { cursor: "cursor-1", pageSize: 50 } });
    await createTicket({ context: { type: "none" }, conversationId: "301", priority: "medium", title: "跟进" });
    await updateTicket("501", { expectedStatus: "open", status: "done" });
    await expect(deleteTicket("501")).resolves.toEqual({ deleted: true });
    await claimTicket("501");
    await addTicketComment("501", { content: "已处理" });

    expect(mock.history.get).toHaveLength(9);
    expect(mock.history.post).toHaveLength(3);
    expect(mock.history.patch[0]?.data).toContain("expectedStatus");
    expect(mock.history.delete).toHaveLength(1);
  });
});
