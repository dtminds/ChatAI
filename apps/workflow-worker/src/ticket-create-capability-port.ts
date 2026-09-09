import type { Database } from "@chatai/database";
import { TicketsRepository } from "@chatai/tickets";
import {
  WorkflowTicketCreateCommandSchema,
  type WorkflowTicketCreateCommand,
} from "@chatai/contracts";
import {
  WORKFLOW_TICKET_CREATE_CAPABILITY_BINDING,
  type WorkflowCapabilityDefinition,
  type WorkflowCapabilityKind,
  type WorkflowCapabilityPort,
  type WorkflowCapabilityRequest,
} from "@chatai/workflow-runtime";
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { Kysely } from "kysely";
import {
  assertCapabilityDefinition,
  createAbortGuard,
  retryableError,
  terminalError,
} from "./capability-port-support.js";
import { findWorkflowSeat } from "./workflow-seat.js";

const CHATAI_PLATFORM = 5;
const DIRECT_CHAT_TYPE = 1;
const ACTIVE_STATUS = 1;
const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
const throwIfAborted = createAbortGuard(
  "WORKFLOW_TICKET_CREATE_ABORTED",
  "创建工单暂时失败",
  "Workflow Ticket Create execution was aborted",
);

export class MysqlWorkflowTicketCreateCapabilityPort implements WorkflowCapabilityPort {
  private readonly tickets: TicketsRepository;

  constructor(private readonly database: Kysely<Database>) {
    this.tickets = new TicketsRepository(database);
  }

  async execute<
    TCommandSchema extends TSchema,
    TResultSchema extends TSchema,
    TKind extends WorkflowCapabilityKind,
  >(
    definition: WorkflowCapabilityDefinition<TCommandSchema, TResultSchema, TKind>,
    request: WorkflowCapabilityRequest<Static<TCommandSchema>, TKind>,
  ): Promise<unknown> {
    assertCapabilityDefinition(
      definition,
      WORKFLOW_TICKET_CREATE_CAPABILITY_BINDING.definition,
      "Workflow Ticket Create",
    );
    if (
      request.subjectType !== "chatai_contact"
      || !Value.Check(WorkflowTicketCreateCommandSchema, request.command)
      || !("idempotencyKey" in request)
      || typeof request.idempotencyKey !== "string"
      || !request.idempotencyKey
      || request.idempotencyKey.length > IDEMPOTENCY_KEY_MAX_LENGTH
      || request.identities.thirdExternalUserId
        !== request.command.recipient.thirdExternalUserId
    ) {
      throw terminalError(
        "WORKFLOW_TICKET_CREATE_REQUEST_INVALID",
        "执行所需数据不可用，流程已停止",
        "Workflow Ticket Create port received an invalid command, subject, identity, or idempotency key",
      );
    }

    const command = structuredClone(request.command) as WorkflowTicketCreateCommand;
    throwIfAborted(request.signal);
    try {
      if (await this.tickets.hasRequestIdempotencyKey(request.idempotencyKey)) return {};
    } catch (error) {
      if (request.signal.aborted) throwIfAborted(request.signal);
      throw retryableError(
        "WORKFLOW_TICKET_CREATE_FAILED",
        "创建工单暂时失败",
        `Workflow Ticket Create idempotency query failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
    throwIfAborted(request.signal);
    const conversationId = await this.resolveConversation({
      command,
      signal: request.signal,
      uid: request.uid,
    });
    throwIfAborted(request.signal);
    try {
      await this.tickets.createWorkflowTicket({
        anchorMessageId: command.anchorMessageId ?? null,
        conversationId,
        description: command.description ?? null,
        idempotencyKey: request.idempotencyKey,
        priority: command.priority,
        title: command.title,
        uid: request.uid,
      });
    } catch (error) {
      if (request.signal.aborted) throwIfAborted(request.signal);
      throw retryableError(
        "WORKFLOW_TICKET_CREATE_FAILED",
        "创建工单暂时失败",
        `Workflow Ticket Create persistence failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
    return {};
  }

  private async resolveConversation(input: {
    command: WorkflowTicketCreateCommand;
    signal: AbortSignal;
    uid: number;
  }) {
    let seat: Awaited<ReturnType<typeof findWorkflowSeat>>;
    let row: { id: number | string } | undefined;
    try {
      seat = await findWorkflowSeat(this.database, {
        seatId: input.command.seatId,
        uid: input.uid,
      });
      throwIfAborted(input.signal);
      if (seat?.platform === CHATAI_PLATFORM) {
        row = await this.database
          .selectFrom("xy_wap_embed_conversation")
          .select("id")
          .where("uid", "=", input.uid)
          .where("platform", "=", CHATAI_PLATFORM)
          .where("third_userid", "=", seat.thirdUserId)
          .where("third_external_userid", "=", input.command.recipient.thirdExternalUserId)
          .where("chat_type", "=", DIRECT_CHAT_TYPE)
          .where("biz_status", "=", ACTIVE_STATUS)
          .orderBy("id", "desc")
          .limit(1)
          .executeTakeFirst();
      }
    } catch (error) {
      if (input.signal.aborted) throwIfAborted(input.signal);
      throw retryableError(
        "WORKFLOW_TICKET_CREATE_CONVERSATION_UNAVAILABLE",
        "创建工单暂时失败",
        `Workflow Ticket Create conversation query failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
    if (!seat || seat.platform !== CHATAI_PLATFORM) {
      throw terminalError(
        "WORKFLOW_TICKET_CREATE_ACCOUNT_UNAVAILABLE",
        "执行所需数据不可用，流程已停止",
        `Workflow Ticket Create seat ${input.command.seatId} is unavailable`,
      );
    }
    const conversationId = row?.id == null ? null : Number(row.id);
    if (!Number.isSafeInteger(conversationId) || (conversationId ?? 0) <= 0) {
      throw terminalError(
        "WORKFLOW_TICKET_CREATE_CONVERSATION_NOT_FOUND",
        "未找到当前客户会话，流程已停止",
        "Workflow Ticket Create active conversation was not found",
      );
    }
    return conversationId as number;
  }
}
