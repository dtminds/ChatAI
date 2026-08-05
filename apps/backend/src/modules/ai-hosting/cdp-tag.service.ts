import type {
  CdpTagGroupItem,
  CdpTagGroupListResponse,
  CdpTagItem,
} from "@chatai/contracts";
import type { AppLogger, RequestAwareLogger } from "../../shared/logger.js";
import {
  createCdpTagJavaClient,
  type CdpTagJavaClient,
  type CdpTagJavaGroupItem,
  type CdpTagJavaTagItem,
} from "./cdp-tag-java-client.js";

export class CdpTagService {
  constructor(private readonly javaClient: CdpTagJavaClient) {}

  async listGroups(uid: number): Promise<CdpTagGroupListResponse> {
    const result = await this.javaClient.listTags({ uid });

    return {
      groups: result.groups
        .map(mapGroupItem)
        .filter((item): item is CdpTagGroupItem => item != null),
    };
  }
}

export function createCdpTagService(logger: AppLogger | RequestAwareLogger) {
  return new CdpTagService(createCdpTagJavaClient(logger));
}

function mapGroupItem(item: CdpTagJavaGroupItem): CdpTagGroupItem | null {
  const groupName =
    typeof item.groupName === "string" ? item.groupName.trim() : "";
  const groupTag =
    typeof item.groupTag === "string" ? item.groupTag.trim() : "";

  if (!groupName || !groupTag) {
    return null;
  }

  return {
    groupName,
    groupTag,
    tags: Array.isArray(item.tags)
      ? item.tags
          .map(mapTagItem)
          .filter((tag): tag is CdpTagItem => tag != null)
      : [],
  };
}

function mapTagItem(item: CdpTagJavaTagItem): CdpTagItem | null {
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const tag = typeof item.tag === "string" ? item.tag.trim() : "";

  if (!name || !tag) {
    return null;
  }

  return { name, tag };
}
