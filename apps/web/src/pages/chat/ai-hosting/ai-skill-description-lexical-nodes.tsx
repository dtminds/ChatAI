import {
  $applyNodeReplacement,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
  TextNode,
} from "lexical";
import type { AiHostingAgentResourceInvalidReason } from "@chatai/contracts";
import {
  getSkillResourceInvalidReasonLabel,
  type SkillContentResourceKind,
} from "./ai-skill-resource";

export type SerializedSkillResourceChipNode = Spread<
  {
    resourceId: string;
    resourceInvalid?: boolean;
    resourceInvalidReason?: AiHostingAgentResourceInvalidReason;
    resourceKind: SkillContentResourceKind;
    resourceName: string;
    resourcePlaceholder: string;
  },
  SerializedTextNode
>;

export class SkillResourceChipNode extends TextNode {
  __resourceId: string;
  __resourceInvalid: boolean;
  __resourceInvalidReason?: AiHostingAgentResourceInvalidReason;
  __resourceKind: SkillContentResourceKind;
  __resourceName: string;
  __resourcePlaceholder: string;

  static getType() {
    return "ai-skill-resource-chip";
  }

  static clone(node: SkillResourceChipNode) {
    return new SkillResourceChipNode(
      {
        id: node.__resourceId,
        invalid: node.__resourceInvalid,
        invalidReason: node.__resourceInvalidReason,
        kind: node.__resourceKind,
        name: node.__resourceName,
        placeholder: node.__resourcePlaceholder,
      },
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedSkillResourceChipNode) {
    return $createSkillResourceChipNode({
      id: serializedNode.resourceId,
      invalid: serializedNode.resourceInvalid,
      invalidReason: serializedNode.resourceInvalidReason,
      kind: serializedNode.resourceKind,
      name: serializedNode.resourceName,
      placeholder: serializedNode.resourcePlaceholder,
    });
  }

  constructor(
    resource: {
      id: string;
      invalid?: boolean;
      invalidReason?: AiHostingAgentResourceInvalidReason;
      kind: SkillContentResourceKind;
      name: string;
      placeholder: string;
    },
    key?: NodeKey,
  ) {
    super(resource.name, key);
    this.__resourceId = resource.id;
    this.__resourceInvalid = Boolean(resource.invalid);
    this.__resourceInvalidReason = resource.invalidReason;
    this.__resourceKind = resource.kind;
    this.__resourceName = resource.name;
    this.__resourcePlaceholder = resource.placeholder;
    this.__mode = 1;
  }

  createDOM(config: EditorConfig) {
    const dom = super.createDOM(config);
    applyChipDomAttributes(
      dom,
      this.__resourceKind,
      this.__resourceInvalid,
      this.__resourceInvalidReason,
      this.__resourceName,
    );
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig) {
    const shouldReplace = super.updateDOM(prevNode, dom, config);

    if (!shouldReplace) {
      applyChipDomAttributes(
        dom,
        this.__resourceKind,
        this.__resourceInvalid,
        this.__resourceInvalidReason,
        this.__resourceName,
      );
    }

    return shouldReplace;
  }

  exportJSON(): SerializedSkillResourceChipNode {
    return {
      resourceId: this.__resourceId,
      resourceInvalid: this.__resourceInvalid,
      resourceInvalidReason: this.__resourceInvalidReason,
      resourceKind: this.__resourceKind,
      resourceName: this.__resourceName,
      resourcePlaceholder: this.__resourcePlaceholder,
      ...super.exportJSON(),
      type: SkillResourceChipNode.getType(),
      version: 1,
    };
  }

  getResourceId() {
    return this.__resourceId;
  }

  getResourceKind() {
    return this.__resourceKind;
  }

  isInvalid() {
    return this.__resourceInvalid;
  }

  getInvalidReason() {
    return this.__resourceInvalidReason;
  }

  getResourceName() {
    return this.__resourceName;
  }

  getResourcePlaceholder() {
    return this.__resourcePlaceholder;
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

export function $createSkillResourceChipNode(resource: {
  id: string;
  invalid?: boolean;
  invalidReason?: AiHostingAgentResourceInvalidReason;
  kind: SkillContentResourceKind;
  name: string;
  placeholder: string;
}) {
  return $applyNodeReplacement(new SkillResourceChipNode(resource));
}

export function $isSkillResourceChipNode(
  node: LexicalNode | null | undefined,
): node is SkillResourceChipNode {
  return node instanceof SkillResourceChipNode;
}

function applyChipDomAttributes(
  dom: HTMLElement,
  kind: SkillContentResourceKind,
  invalid: boolean,
  invalidReason: AiHostingAgentResourceInvalidReason | undefined,
  name: string,
) {
  dom.className = invalid
    ? `${skillResourceChipClassName} agent-resource-chip-invalid`
    : skillResourceChipClassName;
  dom.dataset.skillResourceChip = "true";
  dom.dataset.skillResourceKind = kind;
  dom.dataset.resourceInvalid = String(invalid);

  if (invalid) {
    const reason = getSkillResourceInvalidReasonLabel(
      invalidReason,
      getSkillResourceTypeLabel(kind),
    );
    dom.setAttribute("aria-label", `${name}，${reason}`);
    dom.dataset.resourceInvalidReason = reason;
    dom.removeAttribute("title");
  } else {
    dom.removeAttribute("aria-label");
    dom.removeAttribute("title");
    delete dom.dataset.resourceInvalidReason;
  }
}

function getSkillResourceTypeLabel(kind: SkillContentResourceKind) {
  if (kind === "variable") {
    return "变量";
  }
  if (kind === "tool") {
    return "工具";
  }
  return "知识库";
}

const skillResourceChipClassName =
  "ai-skill-resource-chip mx-0.5 inline-block h-[22px] translate-y-[-1px] rounded-[6px] px-1.5 align-baseline text-[13px] font-normal leading-[22px]";
