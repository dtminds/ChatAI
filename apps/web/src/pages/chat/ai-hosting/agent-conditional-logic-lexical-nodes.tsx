import type { ReactNode } from "react";
import { Book04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  $applyNodeReplacement,
  DecoratorNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import { mockKnowledgeBaseOptions } from "./agent-settings.constants";

export type SerializedKnowledgeBaseChipNode = Spread<
  {
    knowledgeBaseId: string;
  },
  SerializedLexicalNode
>;

export class KnowledgeBaseChipNode extends DecoratorNode<ReactNode> {
  __knowledgeBaseId: string;

  static getType() {
    return "agent-knowledge-base-chip";
  }

  static clone(node: KnowledgeBaseChipNode) {
    return new KnowledgeBaseChipNode(node.__knowledgeBaseId, node.__key);
  }

  static importJSON(serializedNode: SerializedKnowledgeBaseChipNode) {
    return $createKnowledgeBaseChipNode(serializedNode.knowledgeBaseId);
  }

  constructor(knowledgeBaseId: string, key?: NodeKey) {
    super(key);
    this.__knowledgeBaseId = knowledgeBaseId;
  }

  createDOM(_config: EditorConfig) {
    const span = document.createElement("span");
    span.className = "inline align-middle";
    return span;
  }

  updateDOM() {
    return false;
  }

  exportJSON(): SerializedKnowledgeBaseChipNode {
    return {
      knowledgeBaseId: this.__knowledgeBaseId,
      type: KnowledgeBaseChipNode.getType(),
      version: 1,
    };
  }

  getKnowledgeBaseId() {
    return this.__knowledgeBaseId;
  }

  getTextContent(): string {
    return resolveKnowledgeBaseName(this.__knowledgeBaseId);
  }

  isInline(): true {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  decorate(): ReactNode {
    return <KnowledgeBaseChipLabel name={resolveKnowledgeBaseName(this.__knowledgeBaseId)} />;
  }
}

export function $createKnowledgeBaseChipNode(knowledgeBaseId: string) {
  return $applyNodeReplacement(new KnowledgeBaseChipNode(knowledgeBaseId));
}

export function $isKnowledgeBaseChipNode(
  node: LexicalNode | null | undefined,
): node is KnowledgeBaseChipNode {
  return node instanceof KnowledgeBaseChipNode;
}

export function resolveKnowledgeBaseName(knowledgeBaseId: string) {
  return mockKnowledgeBaseOptions.find((option) => option.id === knowledgeBaseId)?.name ?? "";
}

function KnowledgeBaseChipLabel({ name }: { name: string }) {
  return (
    <span className="mx-px inline-flex h-7 max-w-full items-center gap-1 rounded-[6px] border border-border bg-background px-1.5 align-middle text-xs text-foreground">
      <HugeiconsIcon
        className="text-muted-foreground"
        icon={Book04Icon}
        size={14}
        strokeWidth={1.8}
      />
      <span>{name}</span>
    </span>
  );
}
