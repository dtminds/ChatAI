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
      error: 0,
      errorMsg: "",
      success: false,
    }), { status: 200 })));
    const port = createJavaWorkflowDirectEntryEndpointPort();

    await expect(port.getEndpointKey({ uid: 9, workflowId: "31" })).rejects.toMatchObject({
      code: "WORKFLOW_DIRECT_ENTRY_INTERNAL_API_FAILED",
      statusCode: 502,
    });
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
