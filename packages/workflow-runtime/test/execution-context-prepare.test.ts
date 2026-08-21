import { describe, expect, it, vi } from "vitest";
import {
  deriveWorkflowExecutionContextRequirements,
  prepareWorkflowExecutionContext,
  WorkflowContactIdentityLookupError,
  type WorkflowContactIdentityPort,
} from "../src/index.js";

describe("Workflow execution context prepare", () => {
  it("derives direct identity inputs and global context without node declarations", () => {
    expect(deriveWorkflowExecutionContextRequirements(node("message"))).toEqual({
      globalContext: false,
      identities: ["thirdExternalUserId"],
    });
    expect(deriveWorkflowExecutionContextRequirements(node("branch", {
      branchPaths: [{ conditions: [{ selector: ["global", "customer", "name"] }] }],
    }))).toEqual({
      globalContext: true,
      identities: ["externalUserId"],
    });
    expect(deriveWorkflowExecutionContextRequirements(node("tag", {
      value: { selector: ["global", "session", "startedAt"] },
    }))).toEqual({
      globalContext: true,
      identities: ["externalUserId"],
    });
  });

  it("does not call Java when the required identity is already known", async () => {
    const getContactIdentity = vi.fn();
    await expect(prepareWorkflowExecutionContext({
      contactIdentityPort: { getContactIdentity },
      node: node("message"),
      subjectId: "chatai-1",
      subjectType: "chatai_contact",
      trigger: { projection: { externalUserId: 101 } },
      uid: 9,
    })).resolves.toEqual({
      identities: {
        externalUserId: 101,
        thirdExternalUserId: "chatai-1",
      },
    });
    expect(getContactIdentity).not.toHaveBeenCalled();
  });

  it("does not inspect identity data for a node without identity requirements", async () => {
    const getContactIdentity = vi.fn();
    await expect(prepareWorkflowExecutionContext({
      contactIdentityPort: { getContactIdentity },
      node: node("start"),
      subjectId: "chatai-1",
      subjectType: "chatai_contact",
      trigger: { projection: { thirdExternalUserId: "conflicting-chatai-id" } },
      uid: 9,
    })).resolves.toEqual({ identities: {} });
    expect(getContactIdentity).not.toHaveBeenCalled();
  });

  it("calls Java once by the available concrete ID and enriches all returned identities", async () => {
    const getContactIdentity = vi.fn(async () => ({
      externalUserId: 101,
      mallUserId: 202,
      thirdExternalUserId: "chatai-1",
      xyId: 303,
    }));
    await expect(prepareWorkflowExecutionContext({
      contactIdentityPort: { getContactIdentity },
      node: node("tag"),
      subjectId: "chatai-1",
      subjectType: "chatai_contact",
      trigger: {},
      uid: 9,
    })).resolves.toEqual({
      identities: {
        externalUserId: 101,
        mallUserId: 202,
        thirdExternalUserId: "chatai-1",
        xyId: 303,
      },
    });
    expect(getContactIdentity).toHaveBeenCalledTimes(1);
    expect(getContactIdentity).toHaveBeenCalledWith({
      key: { thirdExternalUserId: "chatai-1", type: "thirdExternalUserId" },
      signal: undefined,
      uid: 9,
    });
  });

  it("accepts a successful partial result and leaves missing identity policy to the node", async () => {
    await expect(prepareWorkflowExecutionContext({
      contactIdentityPort: port(async () => ({ externalUserId: 0, thirdExternalUserId: "" })),
      node: node("tag"),
      subjectId: "chatai-1",
      subjectType: "chatai_contact",
      trigger: {},
      uid: 9,
    })).resolves.toEqual({ identities: { thirdExternalUserId: "chatai-1" } });
  });

  it("maps lookup failure to a bounded retryable node failure", async () => {
    await expect(prepareWorkflowExecutionContext({
      contactIdentityPort: port(async () => {
        throw new WorkflowContactIdentityLookupError("identity endpoint returned HTTP 503");
      }),
      node: node("tag"),
      subjectId: "chatai-1",
      subjectType: "chatai_contact",
      trigger: {},
      uid: 9,
    })).rejects.toMatchObject({
      code: "WORKFLOW_CONTACT_IDENTITY_LOOKUP_FAILED",
      failureKind: "retryable",
      message: "客户身份信息查询暂时失败",
    });
  });

  it("maps a terminal Java identity rejection to a terminal node failure", async () => {
    await expect(prepareWorkflowExecutionContext({
      contactIdentityPort: port(async () => {
        throw new WorkflowContactIdentityLookupError(
          "identity endpoint rejected the request",
          { failureKind: "terminal" },
        );
      }),
      node: node("tag"),
      subjectId: "chatai-1",
      subjectType: "chatai_contact",
      trigger: {},
      uid: 9,
    })).rejects.toMatchObject({
      code: "WORKFLOW_CONTACT_IDENTITY_REJECTED",
      failureKind: "terminal",
      message: "客户身份信息查询失败，流程已停止",
    });
  });

  it("rejects conflicting returned identities instead of overwriting known values", async () => {
    await expect(prepareWorkflowExecutionContext({
      contactIdentityPort: port(async () => ({
        externalUserId: 102,
        thirdExternalUserId: "chatai-2",
      })),
      node: node("tag"),
      subjectId: "chatai-1",
      subjectType: "chatai_contact",
      trigger: {},
      uid: 9,
    })).rejects.toMatchObject({
      code: "WORKFLOW_CONTACT_IDENTITY_CONFLICT",
      failureKind: "terminal",
    });
  });

  it.each([
    ["wecom_contact", "101", { externalUserId: 101, type: "externalUserId" }],
    ["miniapp_member", "202", { mallUserId: 202, type: "mallUserId" }],
  ] as const)("uses %s subject as a concrete Java lookup key", async (
    subjectType,
    subjectId,
    expectedKey,
  ) => {
    const getContactIdentity = vi.fn(async () => ({ thirdExternalUserId: "chatai-1" }));
    await prepareWorkflowExecutionContext({
      contactIdentityPort: { getContactIdentity },
      node: node("message"),
      subjectId,
      subjectType,
      trigger: {},
      uid: 9,
    });
    expect(getContactIdentity).toHaveBeenCalledWith(expect.objectContaining({ key: expectedKey }));
  });
});

function node(kind: Parameters<typeof deriveWorkflowExecutionContextRequirements>[0]["kind"], config = {}) {
  return { config, id: "node-1", kind, nodeSchemaVersion: 1 };
}

function port(
  getContactIdentity: WorkflowContactIdentityPort["getContactIdentity"],
): WorkflowContactIdentityPort {
  return { getContactIdentity };
}
