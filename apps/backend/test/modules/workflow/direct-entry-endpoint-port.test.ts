import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createJavaWorkflowDirectEntryEndpointPort,
  WORKFLOW_DIRECT_ENTRY_ENCRYPT_PATH,
} from "../../../src/modules/workflow/direct-entry-endpoint-port.js";

describe("Java Workflow direct-entry endpoint port", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("encrypts the plain Workflow ID through the Java internal API", async () => {
    vi.stubEnv("JAVA_INTERNAL_API_BASE_URL", "https://java.internal/");
    vi.stubEnv("JAVA_INTERNAL_API_TOKEN", "internal-token");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: "encrypted+/workflow-31=",
      error: 0,
      errorMsg: "",
      success: true,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const port = createJavaWorkflowDirectEntryEndpointPort();

    await expect(port.getEndpointKey({ uid: 9, workflowId: "31" }))
      .resolves.toBe("encrypted+/workflow-31=");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`https://java.internal${WORKFLOW_DIRECT_ENTRY_ENCRYPT_PATH}`);
    expect(init).toMatchObject({
      headers: {
        authorization: "Bearer internal-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(JSON.parse(String(init?.body))).toEqual({ content: "31" });
  });

  it("requires the authoritative Java success flag", async () => {
    vi.stubEnv("JAVA_INTERNAL_API_BASE_URL", "https://java.internal");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: "encrypted.workflow-31",
      error: 62001,
      errorMsg: "workflow is not available",
      success: false,
    }), { status: 200 })));
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const port = createJavaWorkflowDirectEntryEndpointPort(logger);

    await expect(port.getEndpointKey({ uid: 9, workflowId: "31" })).rejects.toMatchObject({
      code: "WORKFLOW_DIRECT_ENTRY_INTERNAL_API_FAILED",
      details: {
        error: 62001,
        errorMsg: "workflow is not available",
        operation: "workflow-direct-entry-encrypt",
      },
      statusCode: 502,
    });
    expect(logger.error).toHaveBeenCalledWith({
      error: 62001,
      errorMsg: "workflow is not available",
      operation: "workflow-direct-entry-encrypt",
      uid: 9,
      workflowId: "31",
    }, "内部接口业务失败");
  });

  it("rejects an empty encrypted ID from a successful Java response", async () => {
    vi.stubEnv("JAVA_INTERNAL_API_BASE_URL", "https://java.internal");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: "",
      error: 0,
      errorMsg: "",
      success: true,
    }), { status: 200 })));
    const port = createJavaWorkflowDirectEntryEndpointPort();

    await expect(port.getEndpointKey({ uid: 9, workflowId: "31" })).rejects.toMatchObject({
      code: "WORKFLOW_DIRECT_ENTRY_INTERNAL_API_FAILED",
      details: {
        operation: "workflow-direct-entry-encrypt",
        reason: "data must be a non-empty string",
      },
      statusCode: 502,
    });
  });

  it("fails closed when Java returns a non-object payload", async () => {
    vi.stubEnv("JAVA_INTERNAL_API_BASE_URL", "https://java.internal");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("null", { status: 200 })));
    const port = createJavaWorkflowDirectEntryEndpointPort();

    await expect(port.getEndpointKey({ uid: 9, workflowId: "31" })).rejects.toMatchObject({
      code: "WORKFLOW_DIRECT_ENTRY_INTERNAL_API_FAILED",
      details: {
        operation: "workflow-direct-entry-encrypt",
        reason: "envelope must be an object",
      },
      statusCode: 502,
    });
  });

  it("fails closed when the Java internal API is not configured", async () => {
    vi.stubEnv("JAVA_INTERNAL_API_BASE_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const port = createJavaWorkflowDirectEntryEndpointPort();

    await expect(port.getEndpointKey({ uid: 9, workflowId: "31" })).rejects.toMatchObject({
      code: "WORKFLOW_DIRECT_ENTRY_INTERNAL_API_NOT_CONFIGURED",
      statusCode: 503,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
