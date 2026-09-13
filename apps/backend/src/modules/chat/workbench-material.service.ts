import {
  CHAT_TYPE,
  MATERIAL_COLLECTION_BIZ_TYPE,
  MATERIAL_COLLECTION_GROUP_MAX_COUNT,
  MATERIAL_COLLECTION_TITLE_MAX_LENGTH,
  buildMaterialFileContentJson,
  buildMaterialH5ContentJson,
  buildMaterialImageContentJson,
  buildMaterialMiniProgramContentJson,
  buildMaterialVideoContentJson,
  canEditMaterialCollectionItem,
  isOwnVideoMaterialUrl,
  patchMaterialFileContentJson,
  patchMaterialH5ContentJson,
  patchMaterialVideoContentJson,
  resolveMaterialFileCollectFields,
  resolveMaterialH5CollectFields,
  resolveMaterialImageCollectFields,
  resolveMaterialMiniProgramCollectFields,
  resolveMaterialVideoCollectFields,
  type MaterialCollectionBizType,
  type WorkbenchMaterialCollectionContentType,
  type WorkbenchMaterialCollectionCreateRequest,
  type WorkbenchMaterialCollectionCreateResponse,
  type WorkbenchMaterialCollectionGroupCreateRequest,
  type WorkbenchMaterialCollectionGroupCreateResponse,
  type WorkbenchMaterialCollectionGroupListRequest,
  type WorkbenchMaterialCollectionGroupListResponse,
  type WorkbenchMaterialCollectionGroupUpdateRequest,
  type WorkbenchMaterialCollectionListRequest,
  type WorkbenchMaterialCollectionListResponse,
  type WorkbenchMaterialCollectionMoveRequest,
  type WorkbenchMaterialCollectionOkResponse,
  type WorkbenchMaterialCollectionUpdateRequest,
} from "@chatai/contracts";
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from "../../shared/errors.js";
import { noopLogger, type AppLogger } from "../../shared/logger.js";
import type { AuthenticatedWorkbenchScope } from "../workbench-platform-scope.js";
import type { WorkbenchJavaClient } from "./workbench-java-client.js";
import {
  parseMySqlId,
  type MaterialCollectionScope,
  type WorkbenchRepository,
} from "./workbench-repository.js";
import { getMaterialContentTypeForBizType } from "./material-collection-mappers.js";
import { WorkbenchAccess } from "./workbench-access.js";
import { isRecord } from "./workbench-content-utils.js";

const MATERIAL_COLLECTION_GROUP_TITLE_MAX_LENGTH = 10;

export class WorkbenchMaterialService {
  constructor(
    private readonly repository: WorkbenchRepository,
    private readonly javaClient: WorkbenchJavaClient,
    private readonly access: WorkbenchAccess,
    private readonly logger: AppLogger = noopLogger,
  ) {}

  async listMaterialCollections(
    subUserId: string,
    request: WorkbenchMaterialCollectionListRequest,
  ): Promise<WorkbenchMaterialCollectionListResponse> {
    const me = await this.getMaterialActor(subUserId);
    const bizType = parseMaterialBizType(request.bizType);
    const groupId =
      bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION ? 0 : request.groupId;

    if (bizType !== MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION && groupId == null) {
      throw new BadRequestError("MATERIAL_GROUP_REQUIRED", "请选择分组");
    }

    const requiredGroupId = groupId ?? 0;
    const page = normalizeMaterialPage(request.page);
    const pageSize = normalizeMaterialPageSize(request.pageSize);
    const keyword = request.keyword?.trim();
    const result = await this.repository.listMaterialCollections({
      bizType,
      groupId: requiredGroupId,
      ...(keyword ? { keyword } : {}),
      limit: pageSize,
      offset: (page - 1) * pageSize,
      subUserId,
      uid: me.uid,
    });

    return {
      items: result.items,
      pagination: {
        hasMore: page * pageSize < result.total,
        page,
        pageSize,
        total: result.total,
      },
    };
  }

  async listMaterialGroups(
    subUserId: string,
    request: WorkbenchMaterialCollectionGroupListRequest,
  ): Promise<WorkbenchMaterialCollectionGroupListResponse> {
    const me = await this.getMaterialActor(subUserId);
    const bizType = parseMaterialGroupBizType(request.bizType);

    return {
      groups: await this.repository.listMaterialGroups({
        bizType,
        subUserId,
        uid: me.uid,
      }),
    };
  }

  async collectMaterial(
    subUserId: string,
    request: WorkbenchMaterialCollectionCreateRequest,
  ): Promise<WorkbenchMaterialCollectionCreateResponse> {
    const me = await this.getMaterialActor(subUserId);
    const subUserNumericId = parseMaterialSubUserId(subUserId);
    const bizType = parseMaterialBizType(request.bizType);
    const contentType = getMaterialContentTypeForBizType(bizType);

    if (!contentType) {
      throw new BadRequestError("UNSUPPORTED_MATERIAL_MESSAGE", "当前消息不支持收藏");
    }

    const enterpriseGroupId =
      bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION
        ? undefined
        : readEnterpriseMaterialGroupId(request.groupId);
    const groupId =
      bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION ? 0 : enterpriseGroupId;

    if (groupId === undefined) {
      return {
        success: false,
        errorMsg: "请选择分组",
      };
    }

    if (
      enterpriseGroupId &&
      !(await this.repository.hasActiveMaterialGroup({
        bizType,
        groupId: enterpriseGroupId,
        uid: me.uid,
      }))
    ) {
      return {
        success: false,
        errorMsg: "请选择有效分组",
      };
    }

    const message = await this.repository.findMaterialMessage({
      msgInfoId: request.msgInfoId,
      uid: me.uid,
    });

    if (!message || !isMaterialMessageTypeMatched(bizType, message.msgtype)) {
      throw new BadRequestError("UNSUPPORTED_MATERIAL_MESSAGE", "当前消息不支持收藏");
    }

    if (
      bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO &&
      !isAgentMaterialMessage(message)
    ) {
      return {
        success: false,
        errorMsg: "只能收录席位号发送的视频",
      };
    }

    const rawContentForCollection = await this.prepareMaterialCollectionContent(
      bizType,
      message,
      me,
    );

    if ("errorMsg" in rawContentForCollection) {
      return {
        success: false,
        errorMsg: rawContentForCollection.errorMsg,
      };
    }

    const subUid =
      bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION ? subUserNumericId : 0;
    const sort = Date.now();
    const normalizedMaterial = normalizeMaterialCollectionPayload(
      bizType,
      rawContentForCollection.content,
      request,
      request.msgInfoId,
      contentType,
    );

    if ("errorMsg" in normalizedMaterial) {
      return {
        success: false,
        errorMsg: normalizedMaterial.errorMsg,
      };
    }

    const { content: normalizedContent, title } = normalizedMaterial;
    const msgInfoId = String(message.id);
    const duplicate = await this.repository.findMaterialCollectionByMessage({
      bizType,
      msgInfoId,
      subUid,
      uid: me.uid,
    });

    if (duplicate?.bizStatus === 1) {
      return {
        success: true,
        duplicated: true,
      };
    }

    if (duplicate) {
      await this.repository.restoreMaterialCollection({
        content: normalizedContent,
        groupId,
        id: duplicate.id,
        msgInfoId,
        opSubUserId: subUserId,
        sort,
        title,
        uid: me.uid,
      });

      return {
        success: true,
        duplicated: true,
      };
    }

    const collectionId = await this.repository.createMaterialCollection({
      bizType,
      content: normalizedContent,
      groupId,
      msgInfoId,
      opSubUserId: subUserId,
      sort,
      subUid,
      title,
      uid: me.uid,
    });

    if (collectionId === "DUPLICATE") {
      return {
        success: true,
        duplicated: true,
      };
    }

    if (!collectionId) {
      return {
        success: false,
        errorMsg: "素材收录失败，请稍后重试",
      };
    }

    return {
      success: true,
    };
  }

  async updateMaterialCollection(
    subUserId: string,
    collectionId: string,
    request: WorkbenchMaterialCollectionUpdateRequest,
  ): Promise<WorkbenchMaterialCollectionOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scope = await this.getOperableMaterialCollectionScope(
      me.uid,
      collectionId,
      subUserId,
    );

    if (!canEditMaterialCollectionItem(scope.bizType)) {
      throw new BadRequestError("MATERIAL_COLLECTION_NOT_EDITABLE", "当前素材不支持编辑");
    }

    if (scope.bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
      const title = normalizeMaterialCollectionTitle(request.title ?? "");

      await this.repository.updateMaterialCollectionTitle({
        id: collectionId,
        subUid: scope.subUid,
        title,
        uid: me.uid,
      });

      return { ok: true };
    }

    const record = await this.repository.findMaterialCollectionRecord({
      id: collectionId,
      subUid: scope.subUid,
      uid: me.uid,
    });

    if (!record) {
      throw new NotFoundError("MATERIAL_COLLECTION_NOT_FOUND", "素材不存在");
    }

    const patchResult = buildMaterialCollectionPatch(
      scope.bizType,
      record.content,
      request,
    );

    if ("errorMsg" in patchResult) {
      throw new BadRequestError("MATERIAL_COLLECTION_INVALID", patchResult.errorMsg);
    }

    await this.repository.updateMaterialCollectionContent({
      content: patchResult.content,
      id: collectionId,
      subUid: scope.subUid,
      title: patchResult.title,
      uid: me.uid,
    });

    return { ok: true };
  }

  async deleteMaterialCollection(
    subUserId: string,
    collectionId: string,
  ): Promise<WorkbenchMaterialCollectionOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scope = await this.getOperableMaterialCollectionScope(
      me.uid,
      collectionId,
      subUserId,
    );

    await this.repository.deleteMaterialCollection({
      id: collectionId,
      subUid: scope.subUid,
      uid: me.uid,
    });

    return { ok: true };
  }

  async topMaterialCollection(
    subUserId: string,
    collectionId: string,
  ): Promise<WorkbenchMaterialCollectionOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const scope = await this.getOperableMaterialCollectionScope(
      me.uid,
      collectionId,
      subUserId,
    );

    await this.repository.topMaterialCollection({
      id: collectionId,
      sort: Date.now(),
      subUid: scope.subUid,
      uid: me.uid,
    });

    return { ok: true };
  }

  async moveMaterialCollection(
    subUserId: string,
    collectionId: string,
    request: WorkbenchMaterialCollectionMoveRequest,
  ): Promise<WorkbenchMaterialCollectionOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const groupId = readEnterpriseMaterialGroupId(request.groupId);

    if (groupId === undefined) {
      throw new BadRequestError("MATERIAL_GROUP_REQUIRED", "请选择分组");
    }

    const scope = await this.getOperableMaterialCollectionScope(
      me.uid,
      collectionId,
      subUserId,
    );

    if (scope.bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION) {
      throw new BadRequestError("MATERIAL_GROUP_UNSUPPORTED", "表情不支持移动分组");
    }

    if (
      !(await this.repository.hasActiveMaterialGroup({
        bizType: scope.bizType,
        groupId,
        uid: me.uid,
      }))
    ) {
      throw new BadRequestError("MATERIAL_GROUP_NOT_FOUND", "分组不存在");
    }

    await this.repository.moveMaterialCollection({
      groupId,
      id: collectionId,
      sort: Date.now(),
      subUid: scope.subUid,
      uid: me.uid,
    });

    return { ok: true };
  }

  async createMaterialGroup(
    subUserId: string,
    request: WorkbenchMaterialCollectionGroupCreateRequest,
  ): Promise<WorkbenchMaterialCollectionGroupCreateResponse> {
    const me = await this.getMaterialActor(subUserId);
    const bizType = parseMaterialGroupBizType(request.bizType);
    const sort = Date.now();
    const title = normalizeMaterialGroupTitle(request.title);
    const groupCount = await this.repository.countMaterialGroups({
      bizType,
      subUserId,
      uid: me.uid,
    });

    if (groupCount >= MATERIAL_COLLECTION_GROUP_MAX_COUNT) {
      throw new BadRequestError(
        "MATERIAL_GROUP_LIMIT_REACHED",
        "分组数量已达上限",
      );
    }

    const groupId = await this.repository.createMaterialGroup({
      bizType,
      sort,
      subUid: 0,
      title,
      uid: me.uid,
    });

    if (!groupId) {
      throw new InternalServerError("MATERIAL_GROUP_CREATE_FAILED", "新建分组失败");
    }

    return {
      bizType,
      id: groupId,
      sort,
      title,
    };
  }

  async renameMaterialGroup(
    subUserId: string,
    groupId: string,
    bizTypeValue: number,
    request: WorkbenchMaterialCollectionGroupUpdateRequest,
  ): Promise<WorkbenchMaterialCollectionOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const bizType = parseMaterialGroupBizType(bizTypeValue);

    await this.repository.renameMaterialGroup({
      bizType,
      groupId,
      title: normalizeMaterialGroupTitle(request.title),
      uid: me.uid,
    });

    return { ok: true };
  }

  async topMaterialGroup(
    subUserId: string,
    groupId: string,
    bizTypeValue: number,
  ): Promise<WorkbenchMaterialCollectionOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const bizType = parseMaterialGroupBizType(bizTypeValue);

    await this.repository.topMaterialGroup({
      bizType,
      groupId,
      sort: Date.now(),
      uid: me.uid,
    });

    return { ok: true };
  }

  async deleteMaterialGroup(
    subUserId: string,
    groupId: string,
    bizTypeValue: number,
  ): Promise<WorkbenchMaterialCollectionOkResponse> {
    const me = await this.getMaterialActor(subUserId);
    const bizType = parseMaterialGroupBizType(bizTypeValue);
    const isEmpty = await this.repository.isMaterialGroupEmpty({
      bizType,
      groupId,
      uid: me.uid,
    });

    if (!isEmpty) {
      throw new BadRequestError(
        "MATERIAL_GROUP_NOT_EMPTY",
        "请先移走或删除分组内素材",
      );
    }

    await this.repository.deleteMaterialGroup({
      bizType,
      groupId,
      uid: me.uid,
    });

    return { ok: true };
  }

  private async getMaterialActor(subUserId: string) {
    return this.access.getAuthenticatedWorkbenchScope(subUserId);
  }

  private async prepareMaterialCollectionContent(
    bizType: MaterialCollectionBizType,
    message: {
      content: string | null;
      id: number | string;
    },
    actor: AuthenticatedWorkbenchScope,
  ): Promise<{ content: string | null } | { errorMsg: string }> {
    if (bizType !== MATERIAL_COLLECTION_BIZ_TYPE.VIDEO) {
      return { content: message.content };
    }

    const content = parseMaterialContentRecord(message.content);
    const fileUrl = readMaterialString(content, "fileUrl");
    const resolved = resolveMaterialVideoCollectFields(message.content);

    if ("errorMsg" in resolved) {
      return resolved;
    }

    if (!fileUrl || isOwnVideoMaterialUrl(fileUrl)) {
      return assertVideoMaterialContentReady(message.content);
    }

    const sourceDownloadStatusError = readVideoMaterialDownloadStatusError(message.content);

    if (sourceDownloadStatusError) {
      return sourceDownloadStatusError;
    }

    if (isExternalVideoFileUrlExpired(content)) {
      return { errorMsg: "视频下载地址已过期，无法收录" };
    }

    const msgInfoId = parseMySqlId(String(message.id));

    if (msgInfoId == null) {
      throw new BadRequestError("INVALID_MESSAGE_ID", "消息 ID 不能为空");
    }

    const transferredContent = await this.transferMaterialVideoFile({
      msgInfoId,
      platform: actor.platform,
      uid: actor.uid,
    });

    if (typeof transferredContent !== "string") {
      return transferredContent;
    }

    return assertVideoMaterialContentReady(transferredContent);
  }

  private async transferMaterialVideoFile(input: {
    msgInfoId: number;
    platform: number;
    uid: number;
  }): Promise<string | { errorMsg: string }> {
    try {
      return await this.javaClient.transMsgFile(input);
    } catch (error) {
      this.logger.warn(
        {
          error,
          msgInfoId: input.msgInfoId,
          platform: input.platform,
          uid: input.uid,
        },
        "视频素材转存失败",
      );
      return { errorMsg: "视频转存失败，无法收录" };
    }
  }

  private async getOperableMaterialCollectionScope(
    uid: number,
    collectionId: string,
    subUserId: string,
  ): Promise<MaterialCollectionScope> {
    const scope = await this.repository.findMaterialCollectionScope({
      id: collectionId,
      uid,
    });

    if (!scope) {
      throw new NotFoundError("MATERIAL_COLLECTION_NOT_FOUND", "素材不存在");
    }

    if (scope.bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION) {
      const subUserNumericId = parseMaterialSubUserId(subUserId);

      if (scope.subUid !== subUserNumericId) {
        throw new NotFoundError("MATERIAL_COLLECTION_NOT_FOUND", "素材不存在");
      }

      return scope;
    }

    if (scope.subUid !== 0) {
      throw new NotFoundError("MATERIAL_COLLECTION_NOT_FOUND", "素材不存在");
    }

    return scope;
  }
}

function parseMaterialBizType(value: number): MaterialCollectionBizType {
  switch (value) {
    case MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION:
    case MATERIAL_COLLECTION_BIZ_TYPE.FILE:
    case MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM:
    case MATERIAL_COLLECTION_BIZ_TYPE.H5:
    case MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED:
    case MATERIAL_COLLECTION_BIZ_TYPE.IMAGE:
    case MATERIAL_COLLECTION_BIZ_TYPE.VIDEO:
      return value;
    default:
      throw new BadRequestError("INVALID_MATERIAL_BIZ_TYPE", "素材类型无效");
  }
}

function parseMaterialGroupBizType(
  value: number,
): Exclude<MaterialCollectionBizType, 1> {
  const bizType = parseMaterialBizType(value);

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION) {
    throw new BadRequestError("MATERIAL_GROUP_UNSUPPORTED", "表情不支持自定义分组");
  }

  return bizType;
}

function normalizeMaterialPage(value: number | undefined) {
  return Number.isSafeInteger(value) && value != null && value > 0 ? value : 1;
}

function normalizeMaterialPageSize(value: number | undefined) {
  if (!Number.isSafeInteger(value) || value == null || value <= 0) {
    return 100;
  }

  return Math.min(value, 100);
}

function readEnterpriseMaterialGroupId(groupId: string | 0 | undefined) {
  if (
    groupId === undefined ||
    groupId === 0 ||
    groupId === "0" ||
    !String(groupId).trim()
  ) {
    return undefined;
  }

  return String(groupId);
}

function normalizeMaterialGroupTitle(title: string) {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    throw new BadRequestError(
      "MATERIAL_GROUP_TITLE_REQUIRED",
      "分组名称不能为空",
    );
  }

  if (normalizedTitle.length > MATERIAL_COLLECTION_GROUP_TITLE_MAX_LENGTH) {
    throw new BadRequestError(
      "MATERIAL_GROUP_TITLE_TOO_LONG",
      "分组名称不能超过10个字",
    );
  }

  return normalizedTitle;
}

function normalizeMaterialCollectionTitle(title: string) {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    throw new BadRequestError("MATERIAL_COLLECTION_TITLE_REQUIRED", "素材标题不能为空");
  }

  if (normalizedTitle.length > MATERIAL_COLLECTION_TITLE_MAX_LENGTH) {
    throw new BadRequestError(
      "MATERIAL_COLLECTION_TITLE_TOO_LONG",
      "素材标题不能超过64个字",
    );
  }

  return normalizedTitle;
}

function parseMaterialSubUserId(subUserId: string) {
  const subUserNumericId = parseMySqlId(subUserId);

  if (subUserNumericId == null) {
    throw new BadRequestError("INVALID_SUB_USER", "子账号无效");
  }

  return subUserNumericId;
}

function isMaterialMessageTypeMatched(
  bizType: MaterialCollectionBizType,
  msgtype: string,
) {
  switch (bizType) {
    case MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION:
      return msgtype === "emotion";
    case MATERIAL_COLLECTION_BIZ_TYPE.IMAGE:
      return msgtype === "image";
    case MATERIAL_COLLECTION_BIZ_TYPE.VIDEO:
      return msgtype === "video";
    case MATERIAL_COLLECTION_BIZ_TYPE.FILE:
      return msgtype === "file";
    case MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM:
      return msgtype === "weapp";
    case MATERIAL_COLLECTION_BIZ_TYPE.H5:
      return msgtype === "link";
    case MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED:
      return msgtype === "sphfeed";
    default:
      return false;
  }
}

function isAgentMaterialMessage(message: {
  chatType?: number | null;
  fromType?: number | null;
  thirdFromId?: string | null;
  thirdUserId?: string | null;
}) {
  if (message.chatType === CHAT_TYPE.GROUP) {
    const thirdFromId = (message.thirdFromId ?? "").trim();
    const thirdUserId = (message.thirdUserId ?? "").trim();

    return thirdFromId.length > 0 && thirdFromId === thirdUserId;
  }

  return message.fromType === 1;
}

function normalizeMaterialCollectionPayload(
  bizType: MaterialCollectionBizType,
  rawContent: string | null,
  overrides: Pick<
    WorkbenchMaterialCollectionCreateRequest,
    "description" | "fileName" | "title"
  >,
  msgInfoId: string,
  contentType: WorkbenchMaterialCollectionContentType,
): { content: string; title: string } | { errorMsg: string } {
  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
    const resolved = resolveMaterialFileCollectFields(rawContent, {
      fileName: overrides.fileName,
    });

    if ("errorMsg" in resolved) {
      return resolved;
    }

    return {
      content: buildMaterialFileContentJson(rawContent, resolved),
      title: resolved.fileName,
    };
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5) {
    const resolved = resolveMaterialH5CollectFields(rawContent, {
      description: overrides.description,
      title: overrides.title,
    });

    if ("errorMsg" in resolved) {
      return resolved;
    }

    return {
      content: buildMaterialH5ContentJson(rawContent, resolved),
      title: resolved.title,
    };
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM) {
    const resolved = resolveMaterialMiniProgramCollectFields(rawContent, {
      title: overrides.title,
    });

    if ("errorMsg" in resolved) {
      return resolved;
    }

    return {
      content: buildMaterialMiniProgramContentJson(rawContent, resolved),
      title: resolved.title,
    };
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.IMAGE) {
    const resolved = resolveMaterialImageCollectFields(rawContent);

    if ("errorMsg" in resolved) {
      return resolved;
    }

    return {
      content: buildMaterialImageContentJson(rawContent, resolved),
      title: "图片",
    };
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO) {
    const resolved = resolveMaterialVideoCollectFields(rawContent, {
      title: overrides.title,
    });

    if ("errorMsg" in resolved) {
      return resolved;
    }

    return {
      content: buildMaterialVideoContentJson(rawContent, resolved),
      title: resolved.title,
    };
  }

  return {
    content: rawContent ?? "",
    title: readMaterialTitle(rawContent, contentType, msgInfoId),
  };
}

function buildMaterialCollectionPatch(
  bizType: MaterialCollectionBizType,
  rawContent: string | null | undefined,
  request: WorkbenchMaterialCollectionUpdateRequest,
) {
  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
    return patchMaterialFileContentJson(rawContent, request.fileName ?? "");
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5) {
    return patchMaterialH5ContentJson(rawContent, {
      description: request.description,
      title: request.title ?? "",
    });
  }

  if (bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO) {
    return patchMaterialVideoContentJson(rawContent, request.title ?? "");
  }

  return { errorMsg: "当前素材不支持编辑" };
}

function readMaterialTitle(
  rawContent: string | null,
  contentType: WorkbenchMaterialCollectionContentType,
  msgInfoId: string,
) {
  if (contentType === "emotion") {
    return "表情";
  }

  const content = parseMaterialContentRecord(rawContent);

  if (contentType === "file") {
    return truncateMaterialTitle(readMaterialString(content, "fileName") || msgInfoId);
  }

  if (contentType === "image") {
    return "图片";
  }

  if (contentType === "mini-program") {
    return truncateMaterialTitle(
      readMaterialString(content, "description") ||
        readMaterialString(content, "title") ||
        msgInfoId,
    );
  }

  return truncateMaterialTitle(readMaterialString(content, "title") || msgInfoId);
}

function truncateMaterialTitle(title: string) {
  return title.slice(0, MATERIAL_COLLECTION_TITLE_MAX_LENGTH);
}

export function parseMaterialContentRecord(rawContent: string | null) {
  if (!rawContent) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(rawContent);

    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readMaterialString(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" ? value.trim() : "";
}

function readVideoMaterialDownloadStatusError(rawContent: string | null) {
  const content = parseMaterialContentRecord(rawContent);

  if (readMaterialString(content, "downloadStatus") !== "finished") {
    return { errorMsg: "视频下载未完成，无法收录" };
  }

  return null;
}

function assertVideoMaterialContentReady(
  rawContent: string | null,
): { content: string | null } | { errorMsg: string } {
  const downloadStatusError = readVideoMaterialDownloadStatusError(rawContent);

  if (downloadStatusError) {
    return downloadStatusError;
  }

  return { content: rawContent };
}

function isExternalVideoFileUrlExpired(content: Record<string, unknown>) {
  const expireTime = readMaterialNumber(content, "fileUrlExpireTime");

  return expireTime === undefined || Date.now() > expireTime;
}

function readMaterialNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  const numericValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numericValue) ? numericValue : undefined;
}
