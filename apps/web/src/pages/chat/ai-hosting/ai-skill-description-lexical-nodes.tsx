import {
  $applyNodeReplacement,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
  TextNode,
} from "lexical";
import type { SkillContentResourceKind } from "./ai-skill-resource";

export type SerializedSkillResourceChipNode = Spread<
  {
    resourceId: string;
    resourceKind: SkillContentResourceKind;
    resourceName: string;
    resourcePlaceholder: string;
  },
  SerializedTextNode
>;

export class SkillResourceChipNode extends TextNode {
  __resourceId: string;
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
      kind: serializedNode.resourceKind,
      name: serializedNode.resourceName,
      placeholder: serializedNode.resourcePlaceholder,
    });
  }

  constructor(
    resource: {
      id: string;
      kind: SkillContentResourceKind;
      name: string;
      placeholder: string;
    },
    key?: NodeKey,
  ) {
    super(resource.name, key);
    this.__resourceId = resource.id;
    this.__resourceKind = resource.kind;
    this.__resourceName = resource.name;
    this.__resourcePlaceholder = resource.placeholder;
    this.__mode = 1;
  }

  createDOM(config: EditorConfig) {
    const dom = super.createDOM(config);
    applyChipDomAttributes(dom, this.__resourceKind);
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig) {
    const shouldReplace = super.updateDOM(prevNode, dom, config);

    if (!shouldReplace) {
      applyChipDomAttributes(dom, this.__resourceKind);
    }

    return shouldReplace;
  }

  exportJSON(): SerializedSkillResourceChipNode {
    return {
      resourceId: this.__resourceId,
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

function applyChipDomAttributes(dom: HTMLElement, kind: SkillContentResourceKind) {
  dom.className = skillResourceChipClassName;
  dom.dataset.skillResourceChip = "true";
  dom.dataset.skillResourceKind = kind;
}

const skillResourceChipClassName =
  "ai-skill-resource-chip mx-0.5 inline-block h-[22px] translate-y-[-1px] rounded-[6px] bg-primary/10 px-1.5 align-baseline text-[13px] font-normal leading-[22px] text-primary";
