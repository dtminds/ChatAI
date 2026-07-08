import { describe, expect, it } from "vitest";
import {
  buildMaterialImageContentJson,
  buildMaterialH5ContentJson,
  buildMaterialVideoContentJson,
  canEditMaterialCollectionItem,
  isOwnVideoMaterialUrl,
  patchMaterialMiniProgramContentJson,
  patchMaterialVideoContentJson,
  readMaterialDescription,
  readMaterialLinkUrl,
  resolveMaterialMiniProgramCollectFields,
  resolveMaterialImageCollectFields,
  resolveMaterialH5CollectFields,
  resolveMaterialVideoCollectFields,
  validateMaterialCollectionSubmitFields,
} from "../src/chat/material-collection-content.js";
import { MATERIAL_COLLECTION_BIZ_TYPE } from "../src/chat/enums.js";

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

  it("normalizes video content to canonical fileUrl and coverUrl fields", () => {
    const resolved = resolveMaterialVideoCollectFields(
      JSON.stringify({
        coverUrl: " s5/msg/20260514/272/video-cover.jpg ",
        fileUrl: " https://cdn.example.com/video.mp4 ",
        videoUrl: "https://example.com/ignored-display-url.mp4",
      }),
      { title: " 产品视频 " },
    );

    expect(resolved).toEqual({
      coverUrl: "s5/msg/20260514/272/video-cover.jpg",
      fileUrl: "https://cdn.example.com/video.mp4",
      title: "产品视频",
    });

    const content = JSON.parse(
      buildMaterialVideoContentJson(
        JSON.stringify({
          coverUrl: "s5/msg/20260514/272/video-cover.jpg",
          downloadStatus: "finished",
          fileSerialNo: "serial-video-001",
          fileUrl: "https://cdn.example.com/video.mp4",
          optSerNo: "20260520161942296211617558032",
        }),
        resolved as Exclude<typeof resolved, { errorMsg: string }>,
      ),
    ) as Record<string, unknown>;

    expect(content).toEqual({
      coverUrl: "s5/msg/20260514/272/video-cover.jpg",
      downloadStatus: "finished",
      fileSerialNo: "serial-video-001",
      fileUrl: "https://cdn.example.com/video.mp4",
      optSerNo: "20260520161942296211617558032",
    });
  });

  it("only treats exact bokr video material hosts as own absolute URLs", () => {
    expect(
      isOwnVideoMaterialUrl(
        "https://b5.bokr.com.cn/s5/msg/20260514/272/video.mp4",
      ),
    ).toBe(true);
    expect(
      isOwnVideoMaterialUrl(
        "https://b5.bokr.com.cn.evil.example/s5/msg/20260514/272/video.mp4",
      ),
    ).toBe(false);
  });

  it("rejects video collect fields when fileUrl or coverUrl is missing", () => {
    expect(
      resolveMaterialVideoCollectFields(
        JSON.stringify({
          coverUrl: "s5/msg/20260514/272/video-cover.jpg",
        }),
      ),
    ).toEqual({ errorMsg: "视频缺少地址，无法收录" });

    expect(
      resolveMaterialVideoCollectFields(
        JSON.stringify({
          fileUrl: "https://cdn.example.com/video.mp4",
        }),
      ),
    ).toEqual({ errorMsg: "视频缺少封面，无法收录" });
  });

  it("requires mini-program material remark without changing raw content title", () => {
    const rawContent = JSON.stringify({
      description: "【王知之周一答题】",
      fileUrl: "s5/msg/20260611/272/4cbef024e3e0431bb4278ce82113504c.png",
      title: "王知之自习室",
    });
    const resolved = resolveMaterialMiniProgramCollectFields(rawContent, {
      title: " 搜索标题 ",
    });

    expect(resolved).toEqual({ title: "搜索标题" });
    expect(
      JSON.parse(
        patchMaterialMiniProgramContentJson(rawContent, " 搜索标题 ").content,
      ),
    ).toMatchObject({
      description: "【王知之周一答题】",
      fileUrl: "s5/msg/20260611/272/4cbef024e3e0431bb4278ce82113504c.png",
      title: "王知之自习室",
    });
    expect(
      resolveMaterialMiniProgramCollectFields(rawContent, { title: " " }),
    ).toEqual({ errorMsg: "小程序备注不能为空" });
  });

  it("allows blank video title while keeping video content title-free", () => {
    const rawContent = JSON.stringify({
      coverUrl: "s5/msg/20260514/272/video-cover.jpg",
      fileUrl: "https://cdn.example.com/video.mp4",
      title: "不应写入内容",
    });

    const blankTitlePatch = patchMaterialVideoContentJson(rawContent, " ");
    const customTitlePatch = patchMaterialVideoContentJson(rawContent, " 产品视频 ");

    expect(blankTitlePatch).toMatchObject({ title: "" });
    expect(JSON.parse(blankTitlePatch.content)).toEqual({
      coverUrl: "s5/msg/20260514/272/video-cover.jpg",
      fileUrl: "https://cdn.example.com/video.mp4",
    });
    expect(customTitlePatch.title).toBe("产品视频");
  });

  it("marks file, h5, mini-program and video material items editable", () => {
    expect(canEditMaterialCollectionItem(MATERIAL_COLLECTION_BIZ_TYPE.FILE)).toBe(true);
    expect(canEditMaterialCollectionItem(MATERIAL_COLLECTION_BIZ_TYPE.H5)).toBe(true);
    expect(canEditMaterialCollectionItem(MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM)).toBe(true);
    expect(canEditMaterialCollectionItem(MATERIAL_COLLECTION_BIZ_TYPE.VIDEO)).toBe(true);
    expect(canEditMaterialCollectionItem(MATERIAL_COLLECTION_BIZ_TYPE.IMAGE)).toBe(false);
    expect(canEditMaterialCollectionItem(MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED)).toBe(false);
  });

  it("rejects material submit fields over collection limits", () => {
    expect(
      validateMaterialCollectionSubmitFields({
        description: "d".repeat(65),
        fileName: "f".repeat(65),
        title: "t".repeat(65),
      }),
    ).toEqual({
      errorMsg: "文件名称不能超过 64 个字符",
    });
  });

  it("returns trimmed material submit fields when within limits", () => {
    expect(
      validateMaterialCollectionSubmitFields({
        description: " 描述 ",
        fileName: ` ${"文".repeat(64)} `,
        title: ` ${"标".repeat(64)} `,
      }),
    ).toEqual({
      description: "描述",
      fileName: "文".repeat(64),
      title: "标".repeat(64),
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
