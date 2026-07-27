import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { requestInstance } from "@/lib/request";
import {
  addTicketComment,
  claimTicket,
  createTicket,
  getConversationTickets,
  getTicketContextOptions,
  getTicketCounts,
  getTicketDetail,
  getTickets,
  updateTicket,
} from "@/pages/chat/tickets/api/tickets-service";

const mock = new MockAdapter(requestInstance);

afterEach(() => mock.reset());

describe("tickets service", () => {
  it("uses the public ticket endpoints and preserves query scope", async () => {
    mock.onGet("/server/tickets").reply((config) => [200, { data: { query: config.params }, success: true }]);
    mock.onGet("/server/tickets/counts").reply(200, { data: { assignedToMeActive: 2, unassignedOpen: 1 }, success: true });
    mock.onGet("/server/tickets/context-options").reply(200, { data: { assignees: [], sessions: {} }, success: true });
    mock.onGet("/server/tickets/by-conversation/301").reply(200, { data: { items: [] }, success: true });
    mock.onGet("/server/tickets/501").reply(200, { data: { ticket: {} }, success: true });
    mock.onPost("/server/tickets").reply(200, { data: { ticket: {} }, success: true });
    mock.onPatch("/server/tickets/501").reply(200, { data: { ticket: {} }, success: true });
    mock.onPost("/server/tickets/501/claim").reply(200, { data: { ticket: {} }, success: true });
    mock.onPost("/server/tickets/501/comments").reply(200, { data: { activity: {} }, success: true });

    await expect(getTickets({ page: 2, status: "open", view: "reception" }))
      .resolves.toMatchObject({ query: { page: 2, status: "open", view: "reception" } });
    await getTicketCounts();
    await getTicketContextOptions({ conversationId: "301" });
    await getConversationTickets("301", { scope: "customer" });
    await getTicketDetail("501");
    await createTicket({ context: { type: "none" }, conversationId: "301", priority: "medium", title: "跟进" });
    await updateTicket("501", { expectedStatus: "open", status: "done" });
    await claimTicket("501");
    await addTicketComment("501", { content: "已处理" });

    expect(mock.history.get).toHaveLength(5);
    expect(mock.history.post).toHaveLength(3);
    expect(mock.history.patch[0]?.data).toContain("expectedStatus");
  });
});
