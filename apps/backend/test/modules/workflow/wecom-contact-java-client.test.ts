import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWecomContactJavaClient,
} from "../../../src/modules/workflow/wecom-contact-java-client.js";

describe("wecom contact java client", () => {
  beforeEach(() => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    process.env.JAVA_INTERNAL_API_TOKEN = "java-token";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads contact profiles from the Java contact list", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      javaResponse({
        data: [
          { avatar: "https://cdn.example.com/a.png", id: 3267, name: "张三" },
          { avatar: "  ", id: "3268", name: " 李四 " },
          { id: 0, name: "无效" },
          { avatar: "https://cdn.example.com/skip.png", name: "无 id" },
        ],
        success: true,
      }),
    );

    const contacts = await createWecomContactJavaClient().listByExternalUserIds({
      externalUserIds: [3267, 3268, 3267],
      uid: 9,
    });

    expect([...contacts.entries()]).toEqual([
      [3267, { avatar: "https://cdn.example.com/a.png", name: "张三" }],
      [3268, { avatar: null, name: "李四" }],
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://java.internal/third-internal/work-external-contact/get-contact-list");
    expect(JSON.parse(String(init?.body))).toEqual({
      externalUserIds: [3267, 3268],
      uid: 9,
    });
  });

  it("does not request Java when there are no usable external user ids", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(createWecomContactJavaClient().listByExternalUserIds({
      externalUserIds: [0, -1, Number.NaN],
      uid: 9,
    })).resolves.toEqual(new Map());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats success as authoritative even when diagnostic fields are present", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      javaResponse({
        data: [{ id: 3267, name: "张三" }],
        error: 1,
        errorMsg: "ignored",
        success: true,
      }),
    );

    const contacts = await createWecomContactJavaClient().listByExternalUserIds({
      externalUserIds: [3267],
      uid: 9,
    });

    expect(contacts.get(3267)).toEqual({ avatar: null, name: "张三" });
  });

  it("rejects a Java business failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      javaResponse({
        error: 500,
        errorMsg: "联系人查询失败",
        success: false,
      }),
    );

    await expect(createWecomContactJavaClient().listByExternalUserIds({
      externalUserIds: [3267],
      uid: 9,
    })).rejects.toMatchObject({
      code: "WECOM_CONTACT_INTERNAL_API_FAILED",
    });
  });
});

function javaResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
