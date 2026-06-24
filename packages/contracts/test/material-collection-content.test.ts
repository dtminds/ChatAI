import { describe, expect, it } from "vitest";
import {
  buildMaterialImageContentJson,
  buildMaterialH5ContentJson,
  readMaterialDescription,
  readMaterialLinkUrl,
  resolveMaterialImageCollectFields,
  resolveMaterialH5CollectFields,
  validateMaterialCollectionSubmitFields,
} from "../src/chat/material-collection-content.js";

describe("material collection H5 content helpers", () => {
  it("reads linkUrl from legacy stored content", () => {
    expect(
      readMaterialLinkUrl({
        linkUrl: "https://example.com/page",
        title: "标题",
      }),
    ).toBe("https://example.com/page");
  });

  it("normalizes H5 content to canonical href and description fields", () => {
    const resolved = resolveMaterialH5CollectFields(
      JSON.stringify({
        desc: "旧描述",
        description: "新描述",
        linkUrl: "https://example.com/page",
        title: "标题",
        url: "https://legacy.example.com",
      }),
      {
        description: "编辑后描述",
        title: "编辑后标题",
      },
    );

    expect(resolved).toEqual({
      description: "编辑后描述",
      linkUrl: "https://example.com/page",
      title: "编辑后标题",
    });

    const content = JSON.parse(
      buildMaterialH5ContentJson(
        JSON.stringify({
          desc: "旧描述",
          description: "新描述",
          linkUrl: "https://example.com/page",
          title: "标题",
          url: "https://legacy.example.com",
        }),
        resolved as Exclude<typeof resolved, { errorMsg: string }>,
      ),
    ) as Record<string, unknown>;

    expect(content).toMatchObject({
      description: "编辑后描述",
      href: "https://example.com/page",
      title: "编辑后标题",
    });
    expect(content.desc).toBeUndefined();
    expect(content.linkUrl).toBeUndefined();
    expect(content.url).toBeUndefined();
  });

  it("prefers description over desc when reading legacy content", () => {
    expect(
      readMaterialDescription({
        desc: "旧描述",
        description: "新描述",
      }),
    ).toBe("新描述");
  });

  it("normalizes image content to the canonical fileUrl field", () => {
    const resolved = resolveMaterialImageCollectFields(
      JSON.stringify({
        fileUrl: " https://b5.bokr.com.cn/s5/msg/product.jpg ",
      }),
    );

    expect(resolved).toEqual({
      fileUrl: "https://b5.bokr.com.cn/s5/msg/product.jpg",
    });

    const content = JSON.parse(
      buildMaterialImageContentJson(
        JSON.stringify({
          alt: "商品图",
          fileUrl: "https://b5.bokr.com.cn/s5/msg/product.jpg",
        }),
        resolved as Exclude<typeof resolved, { errorMsg: string }>,
      ),
    ) as Record<string, unknown>;

    expect(content).toMatchObject({
      alt: "商品图",
      fileUrl: "https://b5.bokr.com.cn/s5/msg/product.jpg",
    });
  });

  it("rejects material submit fields over collection limits", () => {
    expect(
      validateMaterialCollectionSubmitFields({
        description: "d".repeat(65),
        fileName: "f".repeat(33),
        title: "t".repeat(33),
      }),
    ).toEqual({
      errorMsg: "文件名称不能超过 32 个字符",
    });
  });

  it("returns trimmed material submit fields when within limits", () => {
    expect(
      validateMaterialCollectionSubmitFields({
        description: " 描述 ",
        fileName: " 文件.pdf ",
        title: " 标题 ",
      }),
    ).toEqual({
      description: "描述",
      fileName: "文件.pdf",
      title: "标题",
    });
  });

  it("rejects H5 collect fields over collection limits", () => {
    expect(
      resolveMaterialH5CollectFields(
        JSON.stringify({
          description: "d".repeat(65),
          href: "https://example.com/page",
          title: "标题",
        }),
      ),
    ).toEqual({
      errorMsg: "链接描述不能超过 64 个字符",
    });
  });
});
