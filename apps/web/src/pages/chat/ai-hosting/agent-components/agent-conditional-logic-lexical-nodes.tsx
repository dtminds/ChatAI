import type { AiHostingAgentResourceInvalidReason } from "@chatai/contracts";
import {
  $applyNodeReplacement,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
  TextNode,
} from "lexical";
import {
  getAgentResourceInvalidReasonLabel,
  mockKnowledgeBaseOptions,
} from "./agent-settings.constants";

export type SerializedKnowledgeBaseChipNode = Spread<
  {
    invalid?: boolean;
    invalidReason?: AiHostingAgentResourceInvalidReason;
    knowledgeBaseId: string;
    knowledgeBaseName?: string;
  },
  SerializedTextNode
>;

export class KnowledgeBaseChipNode extends TextNode {
  __knowledgeBaseId: string;
  __knowledgeBaseName: string;
  __invalid: boolean;
  __invalidReason?: AiHostingAgentResourceInvalidReason;

  static getType() {
    return "agent-knowledge-base-chip";
  }

  static clone(node: KnowledgeBaseChipNode) {
    return new KnowledgeBaseChipNode(
      node.__knowledgeBaseId,
      node.__knowledgeBaseName,
      node.__invalid,
      node.__invalidReason,
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedKnowledgeBaseChipNode) {
    return $createKnowledgeBaseChipNode({
      id: serializedNode.knowledgeBaseId,
      invalid: serializedNode.invalid,
      invalidReason: serializedNode.invalidReason,
      name: serializedNode.knowledgeBaseName,
    });
  }

  constructor(
    knowledgeBaseId: string,
    knowledgeBaseName?: string,
    invalid = false,
    invalidReason?: AiHostingAgentResourceInvalidReason,
    key?: NodeKey,
  ) {
    const displayName = resolveKnowledgeBaseDisplayName(knowledgeBaseId, knowledgeBaseName);

    super(displayName, key);
    this.__knowledgeBaseId = knowledgeBaseId;
    this.__knowledgeBaseName = displayName;
    this.__invalid = invalid;
    this.__invalidReason = invalidReason;
    this.__mode = 1;
  }

  createDOM(config: EditorConfig) {
    const dom = super.createDOM(config);
    applyResourceChipState(
      dom,
      knowledgeBaseChipClassName,
      this.__invalid,
      this.__invalidReason,
      "知识库",
      this.__text,
    );
    dom.dataset.knowledgeBaseChip = "true";
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig) {
    const shouldReplace = super.updateDOM(prevNode, dom, config);

    if (!shouldReplace) {
      applyResourceChipState(
        dom,
        knowledgeBaseChipClassName,
        this.__invalid,
        this.__invalidReason,
        "知识库",
        this.__text,
      );
      dom.dataset.knowledgeBaseChip = "true";
    }

    return shouldReplace;
  }

  exportJSON(): SerializedKnowledgeBaseChipNode {
    return {
      invalid: this.__invalid,
      invalidReason: this.__invalidReason,
      knowledgeBaseId: this.__knowledgeBaseId,
      knowledgeBaseName: this.__knowledgeBaseName,
      ...super.exportJSON(),
      type: KnowledgeBaseChipNode.getType(),
      version: 1,
    };
  }

  getKnowledgeBaseId() {
    return this.__knowledgeBaseId;
  }

  getKnowledgeBaseName() {
    return this.__knowledgeBaseName;
  }

  isInvalid() {
    return this.__invalid;
  }

  getInvalidReason() {
    return this.__invalidReason;
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }

  isTextEntity(): true {
    return true;
  }
}

export function $createKnowledgeBaseChipNode(knowledgeBase: {
  id: string;
  invalid?: boolean;
  invalidReason?: AiHostingAgentResourceInvalidReason;
  name?: string;
}) {
  return $applyNodeReplacement(
    new KnowledgeBaseChipNode(
      knowledgeBase.id,
      knowledgeBase.name,
      knowledgeBase.invalid,
      knowledgeBase.invalidReason,
    ),
  );
}

export function $isKnowledgeBaseChipNode(
  node: LexicalNode | null | undefined,
): node is KnowledgeBaseChipNode {
  return node instanceof KnowledgeBaseChipNode;
}

export function resolveKnowledgeBaseName(knowledgeBaseId: string) {
  return mockKnowledgeBaseOptions.find((option) => option.id === knowledgeBaseId)?.name ?? "";
}

function resolveKnowledgeBaseDisplayName(knowledgeBaseId: string, knowledgeBaseName?: string) {
  return knowledgeBaseName || resolveKnowledgeBaseName(knowledgeBaseId) || knowledgeBaseId;
}

const knowledgeBaseChipClassName =
  "ai-skill-resource-chip agent-kb-chip mx-0.5 inline-block h-[22px] translate-y-[-1px] rounded-[6px] px-1.5 align-baseline text-[13px] font-normal leading-[22px]";

export type SerializedSkillChipNode = Spread<
  {
    invalid?: boolean;
    invalidReason?: AiHostingAgentResourceInvalidReason;
    skillId: string;
    skillName?: string;
  },
  SerializedTextNode
>;

export class SkillChipNode extends TextNode {
  __skillId: string;
  __skillName: string;
  __invalid: boolean;
  __invalidReason?: AiHostingAgentResourceInvalidReason;

  static getType() {
    return "agent-skill-chip";
  }

  static clone(node: SkillChipNode) {
    return new SkillChipNode(
      node.__skillId,
      node.__skillName,
      node.__invalid,
      node.__invalidReason,
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedSkillChipNode) {
    return $createSkillChipNode({
      id: serializedNode.skillId,
      invalid: serializedNode.invalid,
      invalidReason: serializedNode.invalidReason,
      name: serializedNode.skillName,
    });
  }

  constructor(
    skillId: string,
    skillName?: string,
    invalid = false,
    invalidReason?: AiHostingAgentResourceInvalidReason,
    key?: NodeKey,
  ) {
    const displayName = skillName || skillId;

    super(displayName, key);
    this.__skillId = skillId;
    this.__skillName = displayName;
    this.__invalid = invalid;
    this.__invalidReason = invalidReason;
    this.__mode = 1;
  }

  createDOM(config: EditorConfig) {
    const dom = super.createDOM(config);
    applyResourceChipState(
      dom,
      skillChipClassName,
      this.__invalid,
      this.__invalidReason,
      "技能",
      this.__text,
    );
    dom.dataset.skillChip = "true";
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig) {
    const shouldReplace = super.updateDOM(prevNode, dom, config);

    if (!shouldReplace) {
      applyResourceChipState(
        dom,
        skillChipClassName,
        this.__invalid,
        this.__invalidReason,
        "技能",
        this.__text,
      );
      dom.dataset.skillChip = "true";
    }

    return shouldReplace;
  }

  exportJSON(): SerializedSkillChipNode {
    return {
      invalid: this.__invalid,
      invalidReason: this.__invalidReason,
      skillId: this.__skillId,
      skillName: this.__skillName,
      ...super.exportJSON(),
      type: SkillChipNode.getType(),
      version: 1,
    };
  }

  getSkillId() {
    return this.__skillId;
  }

  getSkillName() {
    return this.__skillName;
  }

  isInvalid() {
    return this.__invalid;
  }

  getInvalidReason() {
    return this.__invalidReason;
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }

  isTextEntity(): true {
    return true;
  }
}

export function $createSkillChipNode(skill: {
  id: string;
  invalid?: boolean;
  invalidReason?: AiHostingAgentResourceInvalidReason;
  name?: string;
}) {
  return $applyNodeReplacement(
    new SkillChipNode(
      skill.id,
      skill.name,
      skill.invalid,
      skill.invalidReason,
    ),
  );
}

export function $isSkillChipNode(
  node: LexicalNode | null | undefined,
): node is SkillChipNode {
  return node instanceof SkillChipNode;
}

const skillChipClassName =
  "ai-skill-resource-chip agent-skill-chip mx-0.5 inline-block h-[22px] translate-y-[-1px] rounded-[6px] px-1.5 align-baseline text-[13px] font-normal leading-[22px]";

function applyResourceChipState(
  dom: HTMLElement,
  className: string,
  invalid: boolean,
  invalidReason: AiHostingAgentResourceInvalidReason | undefined,
  resourceType: "技能" | "知识库",
  label: string,
) {
  dom.className = invalid
    ? `${className} agent-resource-chip-invalid`
    : className;
  dom.dataset.resourceInvalid = String(invalid);

  if (invalid) {
    const reason = getAgentResourceInvalidReasonLabel(
      invalidReason,
      resourceType,
    );
    dom.setAttribute("aria-label", `${label}，${reason}`);
    dom.dataset.resourceInvalidReason = reason;
    dom.removeAttribute("title");
  } else {
    dom.removeAttribute("aria-label");
    dom.removeAttribute("title");
    delete dom.dataset.resourceInvalidReason;
  }
}
