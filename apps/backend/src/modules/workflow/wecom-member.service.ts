import {
  WORKFLOW_WECOM_MEMBER_AVATAR_MAX_LENGTH,
  WORKFLOW_WECOM_MEMBER_KEY_MAX_LENGTH,
  WORKFLOW_WECOM_MEMBER_MAX_CHILDREN,
  WORKFLOW_WECOM_MEMBER_MAX_NODES,
  WORKFLOW_WECOM_MEMBER_MAX_SELECTED,
  WORKFLOW_WECOM_MEMBER_TITLE_MAX_LENGTH,
  type WorkflowWeComMemberListResponse,
  type WorkflowWeComMemberNode,
} from "@chatai/contracts";
import { noopLogger, type AppLogger, type RequestAwareLogger } from "../../shared/logger.js";
import {
  createWecomMemberJavaClient,
  type WecomMemberJavaClient,
  type WecomMemberJavaNode,
} from "./wecom-member-java-client.js";

const JAVA_MEMBER_TYPE = 1;
const JAVA_DEPARTMENT_TYPE = 2;

type MapBudget = {
  remaining: number;
};

export class WecomMemberService {
  constructor(
    private readonly javaClient: WecomMemberJavaClient,
    private readonly logger: AppLogger | RequestAwareLogger = noopLogger,
  ) {}

  async listMembers(uid: number): Promise<WorkflowWeComMemberListResponse> {
    const result = await this.javaClient.listDepartmentUsers({ uid });
    const budget: MapBudget = { remaining: WORKFLOW_WECOM_MEMBER_MAX_NODES };
    const seenKeys = new Set<string>();
    const rawRoots = Array.isArray(result.roots) ? result.roots : [];
    const roots = rawRoots
      .map(node => mapNode(node, seenKeys, budget))
      .filter((node): node is WorkflowWeComMemberNode => node != null);

    if (rawRoots.length > 0 && roots.length === 0) {
      this.logger.warn(
        {
          itemCount: rawRoots.length,
          uid,
        },
        "wecom-members 上游有列表项但字段映射后为空",
      );
    }

    return {
      memberLimit: normalizeMemberLimit(result.userLimit),
      roots,
    };
  }
}

export function createWecomMemberService(logger: AppLogger | RequestAwareLogger) {
  return new WecomMemberService(createWecomMemberJavaClient(logger), logger);
}

function mapNode(
  item: WecomMemberJavaNode,
  seenKeys: Set<string>,
  budget: MapBudget,
): WorkflowWeComMemberNode | null {
  if (budget.remaining <= 0 || item.visible === false) {
    return null;
  }

  const id = normalizeKey(item.key);
  const title = normalizeTitle(item.title);

  if (!id || !title || seenKeys.has(id)) {
    return null;
  }

  if (item.type === JAVA_MEMBER_TYPE) {
    const workUserId = parseWorkUserId(item);

    if (workUserId == null) {
      return null;
    }

    seenKeys.add(id);
    budget.remaining -= 1;
    const avatarUrl = normalizeAvatar(item.avatar);
    const selectable = item.notLicense !== true;

    return {
      ...(avatarUrl ? { avatarUrl } : {}),
      children: [],
      id,
      kind: "member",
      ...(selectable ? {} : { selectable: false }),
      title,
      workUserId,
    };
  }

  if (item.type !== JAVA_DEPARTMENT_TYPE) {
    return null;
  }

  seenKeys.add(id);
  budget.remaining -= 1;
  const children: WorkflowWeComMemberNode[] = [];
  const rawChildren = Array.isArray(item.children) ? item.children : [];

  for (const child of rawChildren.slice(0, WORKFLOW_WECOM_MEMBER_MAX_CHILDREN)) {
    if (budget.remaining <= 0) {
      break;
    }

    const mapped = mapNode(child, seenKeys, budget);

    if (mapped) {
      children.push(mapped);
    }
  }

  if (children.length === 0) {
    seenKeys.delete(id);
    budget.remaining += 1;
    return null;
  }

  return { children, id, kind: "department", title };
}

export function parseWorkUserId(item: Pick<WecomMemberJavaNode, "key" | "userKey">) {
  return parsePositiveIdentity(item.userKey) ?? parsePositiveIdentity(item.key);
}

function parsePositiveIdentity(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();

  if (!text) {
    return null;
  }

  if (/^[1-9]\d*$/.test(text)) {
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  const suffix = text.match(/(?:^|[_-])([1-9]\d*)$/);

  if (!suffix) {
    return null;
  }

  const parsed = Number(suffix[1]);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function normalizeKey(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const key = value.trim();
  return key && key.length <= WORKFLOW_WECOM_MEMBER_KEY_MAX_LENGTH ? key : null;
}

function normalizeTitle(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const title = value.trim();
  return title && title.length <= WORKFLOW_WECOM_MEMBER_TITLE_MAX_LENGTH ? title : null;
}

function normalizeAvatar(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const avatarUrl = value.trim();
  return avatarUrl && avatarUrl.length <= WORKFLOW_WECOM_MEMBER_AVATAR_MAX_LENGTH
    ? avatarUrl
    : undefined;
}

function normalizeMemberLimit(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return Math.min(value, WORKFLOW_WECOM_MEMBER_MAX_SELECTED);
  }

  return WORKFLOW_WECOM_MEMBER_MAX_SELECTED;
}
