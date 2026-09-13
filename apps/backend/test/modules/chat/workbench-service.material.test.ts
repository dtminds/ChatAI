import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JAVA_INTERNAL_API_USER_MESSAGE,
  WORKBENCH_INTERNAL_API_FAILED_CODE,
} from "../../../src/modules/chat/workbench-java-client.js";
import { MATERIAL_COLLECTION_BIZ_TYPE } from "@chatai/contracts";
import { BadGatewayError } from "../../../src/shared/errors.js";
import {
  createJavaClient,
  createMaterialItem,
  createMaterialRepository,
  createWorkbenchService,
} from "./workbench-service.test-helpers.js";

describe("MysqlWorkbenchService material facade", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("material: collects expression with current sub user scope", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_000_000);
    const repository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({ md5: "emotion-md5" }),
        id: 9101,
        msgid: "msg-emotion-1",
        msgtype: "emotion",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
        groupId: "9",
        msgInfoId: "9101",
      }),
    ).resolves.toEqual({ success: true });

    expect(repository.createMaterialCollection).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
      content: JSON.stringify({ md5: "emotion-md5" }),
      groupId: 0,
      msgInfoId: "9101",
      opSubUserId: "101",
      sort: 1_779_700_000_000,
      subUid: 101,
      title: "表情",
      uid: 9001,
    });
    nowSpy.mockRestore();
  });

  it("material: collects file with tenant scope and selected group", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_001_000);
    const repository = createMaterialRepository({
      createMaterialCollection: vi.fn().mockResolvedValue("181"),
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileName: "报价.pdf",
          fileUrl: "https://cdn.example.com/quote.pdf",
        }),
        id: "9102",
        msgid: "msg-file-1",
        msgtype: "file",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        msgInfoId: "9102",
      }),
    ).resolves.toEqual({ success: true });

    expect(repository.findMaterialMessage).toHaveBeenCalledWith({
      msgInfoId: "9102",
      uid: 9001,
    });
    expect(repository.createMaterialCollection).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      content: JSON.stringify({
        fileName: "报价.pdf",
        fileUrl: "https://cdn.example.com/quote.pdf",
      }),
      groupId: "9",
      msgInfoId: "9102",
      opSubUserId: "101",
      sort: 1_779_700_001_000,
      subUid: 0,
      title: "报价.pdf",
      uid: 9001,
    });
    nowSpy.mockRestore();
  });

  it("material: rejects file collect when file url is missing", async () => {
    const repository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({ fileName: "报价.pdf" }),
        msgid: "msg-file-1",
        msgtype: "file",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        msgInfoId: "9102",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "文件缺少下载地址，无法收录",
    });
  });

  it("material: collects image messages into tenant materials", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_002_000);
    const repository = createMaterialRepository({
      createMaterialCollection: vi.fn().mockResolvedValue("183"),
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          alt: "商品图",
          fileUrl: "https://cdn.example.com/product.png",
          height: 960,
          width: 720,
        }),
        id: "9106",
        msgid: "msg-image-1",
        msgtype: "image",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.IMAGE,
        groupId: "9",
        msgInfoId: "9106",
      }),
    ).resolves.toEqual({ success: true });

    expect(repository.createMaterialCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.IMAGE,
        groupId: "9",
        msgInfoId: "9106",
        opSubUserId: "101",
        sort: 1_779_700_002_000,
        subUid: 0,
        title: "图片",
        uid: 9001,
      }),
    );
    expect(
      JSON.parse(
        vi.mocked(repository.createMaterialCollection).mock.calls[0]?.[0].content ??
          "{}",
      ),
    ).toEqual({
      alt: "商品图",
      fileUrl: "https://cdn.example.com/product.png",
      height: 960,
      width: 720,
    });
    nowSpy.mockRestore();
  });

  it("material: rejects image collect when image url is missing", async () => {
    const repository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({ alt: "缺少地址" }),
        msgid: "msg-image-1",
        msgtype: "image",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.IMAGE,
        groupId: "9",
        msgInfoId: "9106",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "图片缺少地址，无法收录",
    });

    expect(repository.createMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: collects finished agent video messages into tenant materials", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_002_500);
    const repository = createMaterialRepository({
      createMaterialCollection: vi.fn().mockResolvedValue("184"),
      findMaterialMessage: vi.fn().mockResolvedValue({
        chatType: 2,
        content: JSON.stringify({
          coverUrl: "s5/msg/20260514/272/video-cover.jpg",
          downloadStatus: "finished",
          fileSerialNo: "serial-video-001",
          fileUrl: "s5/msg/20260514/272/video.mp4",
          optSerNo: "20260520161942296211617558032",
        }),
        fromType: 1,
        id: "9107",
        msgid: "msg-video-1",
        msgtype: "video",
        thirdFromId: "seat-third-user-id",
        thirdUserId: "seat-third-user-id",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.VIDEO,
        groupId: "9",
        msgInfoId: "9107",
      }),
    ).resolves.toEqual({ success: true });

    expect(repository.createMaterialCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.VIDEO,
        groupId: "9",
        msgInfoId: "9107",
        opSubUserId: "101",
        sort: 1_779_700_002_500,
        subUid: 0,
        title: "",
        uid: 9001,
      }),
    );
    expect(
      JSON.parse(
        vi.mocked(repository.createMaterialCollection).mock.calls[0]?.[0].content ??
          "{}",
      ),
    ).toEqual({
      coverUrl: "s5/msg/20260514/272/video-cover.jpg",
      downloadStatus: "finished",
      fileSerialNo: "serial-video-001",
      fileUrl: "s5/msg/20260514/272/video.mp4",
      optSerNo: "20260520161942296211617558032",
    });
    nowSpy.mockRestore();
  });

  it("material: rejects video collect from non-agent senders", async () => {
    const repository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        chatType: 2,
        content: JSON.stringify({
          coverUrl: "s5/msg/20260514/272/video-cover.jpg",
          downloadStatus: "finished",
          fileUrl: "https://cdn.example.com/video.mp4",
        }),
        fromType: 2,
        msgid: "msg-video-1",
        msgtype: "video",
        thirdFromId: "customer-third-id",
        thirdUserId: "seat-third-user-id",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.VIDEO,
        groupId: "9",
        msgInfoId: "9107",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "只能收录席位号发送的视频",
    });

    expect(repository.createMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: rejects video collect when video is not ready or cover is missing", async () => {
    const downloadingRepository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        chatType: 1,
        content: JSON.stringify({
          coverUrl: "s5/msg/20260514/272/video-cover.jpg",
          downloadStatus: "ing",
          fileUrl: "https://cdn.example.com/video.mp4",
        }),
        fromType: 1,
        msgid: "msg-video-1",
        msgtype: "video",
        uid: 9001,
      }),
    });
    const downloadingService = createWorkbenchService(
      downloadingRepository,
      createJavaClient(),
    );

    await expect(
      downloadingService.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.VIDEO,
        groupId: "9",
        msgInfoId: "9107",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "视频下载未完成，无法收录",
    });
    expect(downloadingRepository.createMaterialCollection).not.toHaveBeenCalled();

    const missingCoverRepository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        chatType: 1,
        content: JSON.stringify({
          downloadStatus: "finished",
          fileUrl: "https://cdn.example.com/video.mp4",
        }),
        fromType: 1,
        msgid: "msg-video-2",
        msgtype: "video",
        uid: 9001,
      }),
    });
    const missingCoverService = createWorkbenchService(
      missingCoverRepository,
      createJavaClient(),
    );

    await expect(
      missingCoverService.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.VIDEO,
        groupId: "9",
        msgInfoId: "9108",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "视频缺少封面，无法收录",
    });
    expect(missingCoverRepository.createMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: transfers external video files before collecting them", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_002_500);
    const javaClient = createJavaClient();
    vi.mocked(javaClient.transMsgFile).mockResolvedValue(
      JSON.stringify({
        coverUrl: "https://b5.bokr.com.cn/materials/video-cover.jpg",
        downloadStatus: "finished",
        fileSerialNo: "serial-video-002",
        fileUrl: "https://b5.bokr.com.cn/materials/video.mp4",
        optSerNo: "20260520161942296211617558033",
      }),
    );
    const repository = createMaterialRepository({
      createMaterialCollection: vi.fn().mockResolvedValue("185"),
      findMaterialMessage: vi.fn().mockResolvedValue({
        chatType: 1,
        content: JSON.stringify({
          coverUrl: "https://b5.bokr.com.cn/materials/video-cover.jpg",
          downloadStatus: "finished",
          fileSerialNo: "serial-video-002",
          fileUrl: "https://cdn.example.com/video.mp4",
          fileUrlExpireTime: 1_779_700_099_999,
          optSerNo: "20260520161942296211617558033",
        }),
        fromType: 1,
        id: "9109",
        msgid: "msg-video-3",
        msgtype: "video",
        uid: 9001,
      }),
      getSubUser: vi.fn().mockResolvedValue({
        displayName: "客服一号",
        platform: 6,
        subUserId: "101",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(
      repository,
      javaClient,
      undefined,
      undefined,
      { platform: 5, uid: 9001 } as never,
    );

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.VIDEO,
        groupId: "9",
        msgInfoId: "9109",
      }),
    ).resolves.toEqual({ success: true });

    expect(javaClient.transMsgFile).toHaveBeenCalledWith({
      msgInfoId: 9109,
      platform: 5,
      uid: 9001,
    });
    expect(repository.createMaterialCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        content: JSON.stringify({
          coverUrl: "https://b5.bokr.com.cn/materials/video-cover.jpg",
          downloadStatus: "finished",
          fileSerialNo: "serial-video-002",
          fileUrl: "https://b5.bokr.com.cn/materials/video.mp4",
          optSerNo: "20260520161942296211617558033",
        }),
        groupId: "9",
        msgInfoId: "9109",
        title: "",
      }),
    );
    nowSpy.mockRestore();
  });

  it("material: returns business failure when external video transfer fails", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_002_500);
    const javaClient = createJavaClient();
    vi.mocked(javaClient.transMsgFile).mockRejectedValue(
      new BadGatewayError(
        WORKBENCH_INTERNAL_API_FAILED_CODE,
        JAVA_INTERNAL_API_USER_MESSAGE,
      ),
    );
    const repository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        chatType: 1,
        content: JSON.stringify({
          coverUrl: "https://b5.bokr.com.cn/materials/video-cover.jpg",
          downloadStatus: "finished",
          fileSerialNo: "serial-video-transfer-failed",
          fileUrl: "https://cdn.example.com/video.mp4",
          fileUrlExpireTime: 1_779_700_099_999,
          optSerNo: "20260520161942296211617558037",
        }),
        fromType: 1,
        id: "9113",
        msgid: "msg-video-transfer-failed",
        msgtype: "video",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, javaClient);

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.VIDEO,
        groupId: "9",
        msgInfoId: "9113",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "视频转存失败，无法收录",
    });

    expect(javaClient.transMsgFile).toHaveBeenCalledWith({
      msgInfoId: 9113,
      platform: 5,
      uid: 9001,
    });
    expect(repository.createMaterialCollection).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  it("material: collects internal video files without transferring them", async () => {
    const javaClient = createJavaClient();
    const repository = createMaterialRepository({
      createMaterialCollection: vi.fn().mockResolvedValue("186"),
      findMaterialMessage: vi.fn().mockResolvedValue({
        chatType: 1,
        content: JSON.stringify({
          coverUrl: "s5/msg/20260514/272/video-cover.jpg",
          downloadStatus: "finished",
          fileSerialNo: "serial-video-004",
          fileUrl: "s5/msg/20260514/272/video.mp4",
          optSerNo: "20260520161942296211617558035",
        }),
        fromType: 1,
        id: "9111",
        msgid: "msg-video-5",
        msgtype: "video",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, javaClient);

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.VIDEO,
        groupId: "9",
        msgInfoId: "9111",
      }),
    ).resolves.toEqual({ success: true });

    expect(javaClient.transMsgFile).not.toHaveBeenCalled();
    expect(repository.createMaterialCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        content: JSON.stringify({
          coverUrl: "s5/msg/20260514/272/video-cover.jpg",
          downloadStatus: "finished",
          fileSerialNo: "serial-video-004",
          fileUrl: "s5/msg/20260514/272/video.mp4",
          optSerNo: "20260520161942296211617558035",
        }),
        groupId: "9",
        msgInfoId: "9111",
        title: "",
      }),
    );
  });

  it("material: collects internal absolute video URLs without transferring them", async () => {
    const javaClient = createJavaClient();
    const repository = createMaterialRepository({
      createMaterialCollection: vi.fn().mockResolvedValue("187"),
      findMaterialMessage: vi.fn().mockResolvedValue({
        chatType: 1,
        content: JSON.stringify({
          coverUrl: "https://b5.bokr.com.cn/s5/msg/20260514/272/video-cover.jpg",
          downloadStatus: "finished",
          fileSerialNo: "serial-video-absolute",
          fileUrl: "https://b5.bokr.com.cn/s5/msg/20260514/272/video.mp4",
          optSerNo: "20260520161942296211617558038",
        }),
        fromType: 1,
        id: "9114",
        msgid: "msg-video-absolute",
        msgtype: "video",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, javaClient);

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.VIDEO,
        groupId: "9",
        msgInfoId: "9114",
      }),
    ).resolves.toEqual({ success: true });

    expect(javaClient.transMsgFile).not.toHaveBeenCalled();
    expect(repository.createMaterialCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        content: JSON.stringify({
          coverUrl: "https://b5.bokr.com.cn/s5/msg/20260514/272/video-cover.jpg",
          downloadStatus: "finished",
          fileSerialNo: "serial-video-absolute",
          fileUrl: "https://b5.bokr.com.cn/s5/msg/20260514/272/video.mp4",
          optSerNo: "20260520161942296211617558038",
        }),
        groupId: "9",
        msgInfoId: "9114",
        title: "",
      }),
    );
  });

  it("material: rejects expired external video files before collecting them", async () => {
    const repository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        chatType: 1,
        content: JSON.stringify({
          coverUrl: "https://b5.bokr.com.cn/materials/video-cover.jpg",
          downloadStatus: "finished",
          fileSerialNo: "serial-video-003",
          fileUrl: "https://cdn.example.com/video.mp4",
          fileUrlExpireTime: 1_779_699_999_999,
          optSerNo: "20260520161942296211617558034",
        }),
        fromType: 1,
        id: "9110",
        msgid: "msg-video-4",
        msgtype: "video",
        uid: 9001,
      }),
    });
    const javaClient = createJavaClient();
    const service = createWorkbenchService(repository, javaClient);

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.VIDEO,
        groupId: "9",
        msgInfoId: "9110",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "视频下载地址已过期，无法收录",
    });

    expect(javaClient.transMsgFile).not.toHaveBeenCalled();
    expect(repository.createMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: transfers external video files with workbench platform scope", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_002_500);
    const javaClient = createJavaClient();
    vi.mocked(javaClient.transMsgFile).mockResolvedValue(
      JSON.stringify({
        coverUrl: "https://b5.bokr.com.cn/materials/video-cover.jpg",
        downloadStatus: "finished",
        fileSerialNo: "serial-video-004",
        fileUrl: "https://b5.bokr.com.cn/materials/video.mp4",
        optSerNo: "20260520161942296211617558035",
      }),
    );
    const repository = createMaterialRepository({
      createMaterialCollection: vi.fn().mockResolvedValue("186"),
      findMaterialMessage: vi.fn().mockResolvedValue({
        chatType: 1,
        content: JSON.stringify({
          coverUrl: "https://b5.bokr.com.cn/materials/video-cover.jpg",
          downloadStatus: "finished",
          fileSerialNo: "serial-video-004",
          fileUrl: "https://cdn.example.com/video.mp4",
          fileUrlExpireTime: 1_779_700_099_999,
          optSerNo: "20260520161942296211617558035",
        }),
        fromType: 1,
        id: "9115",
        msgid: "msg-video-5",
        msgtype: "video",
        uid: 9001,
      }),
      getSubUser: vi.fn().mockResolvedValue({
        displayName: "客服一号",
        subUserId: "101",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, javaClient);

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.VIDEO,
        groupId: "9",
        msgInfoId: "9115",
      }),
    ).resolves.toEqual({ success: true });

    expect(javaClient.transMsgFile).toHaveBeenCalledWith({
      msgInfoId: 9115,
      platform: 5,
      uid: 9001,
    });
    expect(repository.createMaterialCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        content: JSON.stringify({
          coverUrl: "https://b5.bokr.com.cn/materials/video-cover.jpg",
          downloadStatus: "finished",
          fileSerialNo: "serial-video-004",
          fileUrl: "https://b5.bokr.com.cn/materials/video.mp4",
          optSerNo: "20260520161942296211617558035",
        }),
        groupId: "9",
        msgInfoId: "9115",
        title: "",
      }),
    );
    nowSpy.mockRestore();
  });

  it("material: rejects external video files without expire time before collecting them", async () => {
    const repository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        chatType: 1,
        content: JSON.stringify({
          coverUrl: "https://b5.bokr.com.cn/materials/video-cover.jpg",
          downloadStatus: "finished",
          fileSerialNo: "serial-video-005",
          fileUrl: "https://cdn.example.com/video.mp4",
          optSerNo: "20260520161942296211617558036",
        }),
        fromType: 1,
        id: "9112",
        msgid: "msg-video-6",
        msgtype: "video",
        uid: 9001,
      }),
    });
    const javaClient = createJavaClient();
    const service = createWorkbenchService(repository, javaClient);

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.VIDEO,
        groupId: "9",
        msgInfoId: "9112",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "视频下载地址已过期，无法收录",
    });

    expect(javaClient.transMsgFile).not.toHaveBeenCalled();
    expect(repository.createMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: rejects generated material title over collection limit", async () => {
    const longFileName = `${"超".repeat(70)}.pdf`;
    const repository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileName: longFileName,
          fileUrl: "https://cdn.example.com/long.pdf",
        }),
        msgid: "msg-file-1",
        msgtype: "file",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        msgInfoId: "9102",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "文件名称不能超过 64 个字符",
    });

    expect(repository.createMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: requires a real group before collecting tenant materials", async () => {
    const repository = createMaterialRepository();
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        msgInfoId: "9105",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "请选择分组",
    });
    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        groupId: 0,
        msgInfoId: "9105",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "请选择分组",
    });
    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        groupId: "0",
        msgInfoId: "9105",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "请选择分组",
    });

    expect(repository.findMaterialMessage).not.toHaveBeenCalled();
    expect(repository.createMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: trims and forwards keyword when listing grouped collections", async () => {
    const repository = createMaterialRepository({
      listMaterialCollections: vi.fn().mockResolvedValue({
        items: [createMaterialItem({ title: "报价文件" })],
        total: 1,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.listMaterialCollections("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        keyword: " 报价 ",
        page: 2,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ title: "报价文件" })],
      pagination: {
        hasMore: false,
        page: 2,
        pageSize: 20,
        total: 1,
      },
    });

    expect(repository.listMaterialCollections).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      groupId: "9",
      keyword: "报价",
      limit: 20,
      offset: 20,
      subUserId: "101",
      uid: 9001,
    });
  });

  it("material: collects mini-program with table title without changing content title", async () => {
    const repository = createMaterialRepository({
      createMaterialCollection: vi.fn().mockResolvedValue("188"),
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          description: "【王知之周一答题】",
          fileUrl: "mini-program/cover.png",
          title: "王知之自习室",
        }),
        id: 9108,
        msgid: "msg-mini-program-1",
        msgtype: "weapp",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
        groupId: "9",
        msgInfoId: "9108",
        title: " 搜索标题 ",
      }),
    ).resolves.toEqual({ success: true });

    expect(repository.createMaterialCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
        groupId: "9",
        msgInfoId: "9108",
        subUid: 0,
        title: "搜索标题",
      }),
    );
    expect(
      JSON.parse(
        vi.mocked(repository.createMaterialCollection).mock.calls[0]?.[0].content ??
          "{}",
      ),
    ).toMatchObject({
      description: "【王知之周一答题】",
      fileUrl: "mini-program/cover.png",
      title: "王知之自习室",
    });
  });

  it("material: collects sphfeed messages into tenant materials", async () => {
    const repository = createMaterialRepository({
      createMaterialCollection: vi.fn().mockResolvedValue("182"),
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          description: "杭州高架惊现鸵鸟飞奔",
          imageUrl: "https://finder.video.qq.com/cover.jpg",
          linkUrl: "https://channels.weixin.qq.com/web/pages/feed?eid=export",
          title: "都市快报",
        }),
        msgid: "msg-sphfeed-001",
        id: 9104,
        msgtype: "sphfeed",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED,
        groupId: "9",
        msgInfoId: "9104",
      }),
    ).resolves.toEqual({ success: true });

    expect(repository.createMaterialCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED,
        msgInfoId: "9104",
        title: "都市快报",
        uid: 9001,
      }),
    );
  });

  it("material: rejects invalid selected group before collecting tenant materials", async () => {
    const repository = createMaterialRepository({
      hasActiveMaterialGroup: vi.fn().mockResolvedValue(false),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        groupId: "9",
        msgInfoId: "9105",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "请选择有效分组",
    });

    expect(repository.hasActiveMaterialGroup).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
      groupId: "9",
      uid: 9001,
    });
    expect(repository.findMaterialMessage).not.toHaveBeenCalled();
    expect(repository.createMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: returns failure result when create does not insert", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_003_000);
    const repository = createMaterialRepository({
      createMaterialCollection: vi.fn().mockResolvedValue(undefined),
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          coverUrl: "https://media.example.com/static/image/default-redpacket.png",
          desc: "恭喜发财，大吉大利",
          href: "https://m-scrm-test.dtminds.com/h5/pages/redpacketSend/index",
          title: "红包来啦",
        }),
        msgid: "1025657",
        id: 9105,
        msgtype: "link",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        groupId: "9",
        msgInfoId: "9105",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "素材收录失败，请稍后重试",
    });

    nowSpy.mockRestore();
  });

  it("material: collects tenant messages without seat access checks", async () => {
    const repository = createMaterialRepository({
      canAccessSeat: vi.fn().mockResolvedValue(false),
      createMaterialCollection: vi.fn().mockResolvedValue("181"),
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileName: "报价.pdf",
          fileUrl: "https://cdn.example.com/quote.pdf",
        }),
        msgid: "msg-file-1",
        id: 9106,
        msgtype: "file",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        msgInfoId: "9106",
      }),
    ).resolves.toEqual({ success: true });

    expect(repository.canAccessSeat).not.toHaveBeenCalled();
    expect(repository.createMaterialCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        msgInfoId: "9106",
        uid: 9001,
      }),
    );
  });

  it("material: returns duplicate when concurrent insert hits unique key", async () => {
    const repository = createMaterialRepository({
      createMaterialCollection: vi.fn().mockResolvedValue("DUPLICATE"),
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileName: "报价.pdf",
          fileUrl: "https://cdn.example.com/quote.pdf",
        }),
        msgid: "msg-file-1",
        id: 9107,
        msgtype: "file",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        msgInfoId: "9107",
      }),
    ).resolves.toEqual({
      success: true,
      duplicated: true,
    });
  });

  it("material: returns active duplicate without inserting", async () => {
    const existingItem = createMaterialItem({
      id: "77",
      msgInfoId: "9108",
      title: "已收藏文件",
    });
    const repository = createMaterialRepository({
      findMaterialCollectionByMessage: vi.fn().mockResolvedValue({
        bizStatus: 1,
        id: "77",
        item: existingItem,
      }),
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileName: "报价.pdf",
          fileUrl: "https://cdn.example.com/quote.pdf",
        }),
        msgid: "msg-file-1",
        id: 9108,
        msgtype: "file",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        msgInfoId: "9108",
      }),
    ).resolves.toEqual({
      success: true,
      duplicated: true,
    });

    expect(repository.createMaterialCollection).not.toHaveBeenCalled();
    expect(repository.restoreMaterialCollection).not.toHaveBeenCalled();
    expect(repository.findMaterialCollectionByMessage).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      msgInfoId: "9108",
      subUid: 0,
      uid: 9001,
    });
  });

  it("material: restores deleted duplicate with refreshed fields", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_002_000);
    const existingItem = createMaterialItem({
      groupId: "3",
      id: "77",
      msgInfoId: "9103",
      title: "旧文件",
    });
    const repository = createMaterialRepository({
      findMaterialCollectionByMessage: vi.fn().mockResolvedValue({
        bizStatus: 0,
        id: "77",
        item: existingItem,
      }),
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileName: "新报价.pdf",
          fileUrl: "https://cdn.example.com/new-quote.pdf",
        }),
        id: 9103,
        msgid: "msg-file-1",
        msgtype: "file",
        uid: 9001,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        msgInfoId: "9103",
      }),
    ).resolves.toEqual({
      success: true,
      duplicated: true,
    });

    expect(repository.restoreMaterialCollection).toHaveBeenCalledWith({
      content: JSON.stringify({
        fileName: "新报价.pdf",
        fileUrl: "https://cdn.example.com/new-quote.pdf",
      }),
      groupId: "9",
      id: "77",
      msgInfoId: "9103",
      opSubUserId: "101",
      sort: 1_779_700_002_000,
      title: "新报价.pdf",
      uid: 9001,
    });
    expect(repository.createMaterialCollection).not.toHaveBeenCalled();
    expect(repository.findMaterialCollectionByMessage).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      msgInfoId: "9103",
      subUid: 0,
      uid: 9001,
    });
    nowSpy.mockRestore();
  });

  it("material: rejects expression group creation", async () => {
    const service = createWorkbenchService(
      createMaterialRepository(),
      createJavaClient(),
    );

    await expect(
      service.createMaterialGroup("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION as never,
        title: "表情分组",
      }),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_UNSUPPORTED",
      statusCode: 400,
    });
  });

  it("material: rejects material group creation when limit is reached", async () => {
    const repository = createMaterialRepository({
      countMaterialGroups: vi.fn().mockResolvedValue(20),
      createMaterialGroup: vi.fn().mockResolvedValue("88"),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.createMaterialGroup("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        title: "常用文件",
      }),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_LIMIT_REACHED",
      statusCode: 400,
    });

    expect(repository.createMaterialGroup).not.toHaveBeenCalled();
  });

  it("material: creates material group and returns the created group", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_004_000);
    const repository = createMaterialRepository({
      createMaterialGroup: vi.fn().mockResolvedValue("88"),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.createMaterialGroup("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        title: " 常用文件 ",
      }),
    ).resolves.toEqual({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      id: "88",
      sort: 1_779_700_004_000,
      title: "常用文件",
    });

    expect(repository.createMaterialGroup).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      sort: 1_779_700_004_000,
      subUid: 0,
      title: "常用文件",
      uid: 9001,
    });
    nowSpy.mockRestore();
  });

  it("material: returns internal error when material group creation has no id", async () => {
    const repository = createMaterialRepository({
      createMaterialGroup: vi.fn().mockResolvedValue(undefined),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.createMaterialGroup("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        title: "常用文件",
      }),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_CREATE_FAILED",
      statusCode: 500,
    });
  });

  it("material: rejects material group names over 10 characters", async () => {
    const repository = createMaterialRepository();
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.createMaterialGroup("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        title: "一二三四五六七八九十甲",
      }),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_TITLE_TOO_LONG",
      statusCode: 400,
    });

    await expect(
      service.renameMaterialGroup("101", "9", MATERIAL_COLLECTION_BIZ_TYPE.FILE, {
        title: "一二三四五六七八九十甲",
      }),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_TITLE_TOO_LONG",
      statusCode: 400,
    });

    expect(repository.createMaterialGroup).not.toHaveBeenCalled();
    expect(repository.renameMaterialGroup).not.toHaveBeenCalled();
  });

  it("material: rejects blank material group names after trimming", async () => {
    const repository = createMaterialRepository();
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.createMaterialGroup("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        title: "   ",
      }),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_TITLE_REQUIRED",
      statusCode: 400,
    });

    await expect(
      service.renameMaterialGroup("101", "9", MATERIAL_COLLECTION_BIZ_TYPE.FILE, {
        title: "   ",
      }),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_TITLE_REQUIRED",
      statusCode: 400,
    });

    expect(repository.createMaterialGroup).not.toHaveBeenCalled();
    expect(repository.renameMaterialGroup).not.toHaveBeenCalled();
  });

  it("material: mutates tenant materials with shared sub user scope", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_005_000);
    const repository = createMaterialRepository({
      findMaterialCollectionScope: vi.fn().mockResolvedValue({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        subUid: 0,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(service.deleteMaterialCollection("101", "66")).resolves.toEqual({
      ok: true,
    });
    await expect(service.topMaterialCollection("101", "66")).resolves.toEqual({
      ok: true,
    });
    await expect(
      service.moveMaterialCollection("101", "66", { groupId: "9" }),
    ).resolves.toEqual({ ok: true });

    expect(repository.deleteMaterialCollection).toHaveBeenCalledWith({
      id: "66",
      subUid: 0,
      uid: 9001,
    });
    expect(repository.topMaterialCollection).toHaveBeenCalledWith({
      id: "66",
      sort: 1_779_700_005_000,
      subUid: 0,
      uid: 9001,
    });
    expect(repository.moveMaterialCollection).toHaveBeenCalledWith({
      groupId: "9",
      id: "66",
      sort: 1_779_700_005_000,
      subUid: 0,
      uid: 9001,
    });
    nowSpy.mockRestore();
  });

  it("material: updates file and h5 collection content/title when edited", async () => {
    const fileRepository = createMaterialRepository({
      findMaterialCollectionRecord: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileName: "报价.pdf",
          fileUrl: "https://cdn.example.com/a.pdf",
        }),
        id: "66",
      }),
      findMaterialCollectionScope: vi.fn().mockResolvedValue({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        subUid: 0,
      }),
    });
    const fileService = createWorkbenchService(fileRepository, createJavaClient());

    await expect(
      fileService.updateMaterialCollection("101", "66", {
        fileName: "新报价.pdf",
      }),
    ).resolves.toEqual({ ok: true });

    expect(fileRepository.findMaterialCollectionRecord).toHaveBeenCalledWith({
      id: "66",
      subUid: 0,
      uid: 9001,
    });
    expect(fileRepository.updateMaterialCollectionContent).toHaveBeenCalledWith({
      content: JSON.stringify({
        fileName: "新报价.pdf",
        fileUrl: "https://cdn.example.com/a.pdf",
      }),
      id: "66",
      subUid: 0,
      title: "新报价.pdf",
      uid: 9001,
    });

    const h5Repository = createMaterialRepository({
      findMaterialCollectionRecord: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          description: "旧描述",
          href: "https://example.com/page",
          title: "旧标题",
        }),
        id: "77",
      }),
      findMaterialCollectionScope: vi.fn().mockResolvedValue({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        subUid: 0,
      }),
    });
    const h5Service = createWorkbenchService(h5Repository, createJavaClient());

    await expect(
      h5Service.updateMaterialCollection("101", "77", {
        description: "新描述",
        title: "新标题",
      }),
    ).resolves.toEqual({ ok: true });

    expect(h5Repository.updateMaterialCollectionContent).toHaveBeenCalledWith({
      content: JSON.stringify({
        description: "新描述",
        href: "https://example.com/page",
        title: "新标题",
      }),
      id: "77",
      subUid: 0,
      title: "新标题",
      uid: 9001,
    });
  });

  it("material: updates mini-program table title without changing content", async () => {
    const miniProgramRepository = createMaterialRepository({
      findMaterialCollectionScope: vi.fn().mockResolvedValue({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
        subUid: 0,
      }),
    });
    const miniProgramService = createWorkbenchService(
      miniProgramRepository,
      createJavaClient(),
    );

    await expect(
      miniProgramService.updateMaterialCollection("101", "88", {
        title: " 新小程序标题 ",
      }),
    ).resolves.toEqual({ ok: true });

    expect(miniProgramRepository.updateMaterialCollectionTitle).toHaveBeenCalledWith({
      id: "88",
      subUid: 0,
      title: "新小程序标题",
      uid: 9001,
    });
    expect(miniProgramRepository.findMaterialCollectionRecord).not.toHaveBeenCalled();
    expect(miniProgramRepository.updateMaterialCollectionContent).not.toHaveBeenCalled();
  });

  it("material: updates video collection titles when edited", async () => {
    const videoRepository = createMaterialRepository({
      findMaterialCollectionRecord: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          coverUrl: "s5/msg/20260514/272/video-cover.jpg",
          fileUrl: "s5/msg/20260514/272/video.mp4",
          title: "旧视频标题",
        }),
        id: "99",
      }),
      findMaterialCollectionScope: vi.fn().mockResolvedValue({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.VIDEO,
        subUid: 0,
      }),
    });
    const videoService = createWorkbenchService(videoRepository, createJavaClient());

    await expect(
      videoService.updateMaterialCollection("101", "99", {
        title: " ",
      }),
    ).resolves.toEqual({ ok: true });

    expect(videoRepository.updateMaterialCollectionContent).toHaveBeenCalledWith({
      content: JSON.stringify({
        coverUrl: "s5/msg/20260514/272/video-cover.jpg",
        fileUrl: "s5/msg/20260514/272/video.mp4",
      }),
      id: "99",
      subUid: 0,
      title: "",
      uid: 9001,
    });
  });

  it("material: rejects another sub user's expression collection operation", async () => {
    const repository = createMaterialRepository({
      findMaterialCollectionScope: vi.fn().mockResolvedValue({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
        subUid: 202,
      }),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(service.deleteMaterialCollection("101", "66")).rejects.toMatchObject({
      code: "MATERIAL_COLLECTION_NOT_FOUND",
      statusCode: 404,
    });

    expect(repository.deleteMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: validates target group when moving tenant materials", async () => {
    const repository = createMaterialRepository({
      findMaterialCollectionScope: vi.fn().mockResolvedValue({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        subUid: 0,
      }),
      hasActiveMaterialGroup: vi.fn().mockResolvedValue(false),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.moveMaterialCollection("101", "66", { groupId: "9" }),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_NOT_FOUND",
      statusCode: 400,
    });

    expect(repository.hasActiveMaterialGroup).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
      groupId: "9",
      uid: 9001,
    });
    expect(repository.moveMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: renames and tops material groups", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_006_000);
    const repository = createMaterialRepository();
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.renameMaterialGroup("101", "9", MATERIAL_COLLECTION_BIZ_TYPE.FILE, {
        title: "新分组",
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      service.topMaterialGroup("101", "9", MATERIAL_COLLECTION_BIZ_TYPE.FILE),
    ).resolves.toEqual({ ok: true });

    expect(repository.renameMaterialGroup).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      groupId: "9",
      title: "新分组",
      uid: 9001,
    });
    expect(repository.topMaterialGroup).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      groupId: "9",
      sort: 1_779_700_006_000,
      uid: 9001,
    });
    nowSpy.mockRestore();
  });

  it("material: rejects unsupported and mismatched message types", async () => {
    const unsupportedRepository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({ text: "普通文本" }),
        id: 9109,
        msgid: "msg-text-1",
        msgtype: "text",
        uid: 9001,
      }),
    });
    const unsupportedService = createWorkbenchService(
      unsupportedRepository,
      createJavaClient(),
    );

    await expect(
      unsupportedService.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        msgInfoId: "9109",
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_MATERIAL_MESSAGE",
      statusCode: 400,
    });
    expect(unsupportedRepository.createMaterialCollection).not.toHaveBeenCalled();

    const mismatchedRepository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({ fileName: "报价.pdf" }),
        id: 9110,
        msgid: "msg-file-1",
        msgtype: "file",
        uid: 9001,
      }),
    });
    const mismatchedService = createWorkbenchService(
      mismatchedRepository,
      createJavaClient(),
    );

    await expect(
      mismatchedService.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        groupId: "9",
        msgInfoId: "9110",
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_MATERIAL_MESSAGE",
      statusCode: 400,
    });
    expect(mismatchedRepository.createMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: rejects non-empty group deletion", async () => {
    const repository = createMaterialRepository({
      isMaterialGroupEmpty: vi.fn().mockResolvedValue(false),
    });
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.deleteMaterialGroup("101", "9", MATERIAL_COLLECTION_BIZ_TYPE.FILE),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_NOT_EMPTY",
      message: "请先移走或删除分组内素材",
      statusCode: 400,
    });

    expect(repository.deleteMaterialGroup).not.toHaveBeenCalled();
  });

});
