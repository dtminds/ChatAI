import type { ReactNode } from "react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import {
  $applyNodeReplacement,
  $getNodeByKey,
  DecoratorNode,
  TextNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type SerializedTextNode,
  type Spread,
} from "lexical";

export type SerializedComposerEmojiNode = Spread<
  {
    name: string;
    src: string;
    token: string;
  },
  SerializedLexicalNode
>;

export type SerializedComposerImageNode = Spread<
  {
    alt: string;
    clientId?: string;
    fileId?: string;
    height?: number;
    localUrl?: string;
    src: string;
    width?: number;
  },
  SerializedLexicalNode
>;

export type SerializedComposerMentionNode = Spread<
  {
    displayName: string;
    isAll?: boolean;
    memberId: string;
  },
  SerializedTextNode
>;

export class ComposerEmojiNode extends DecoratorNode<ReactNode> {
  __name: string;
  __src: string;
  __token: string;

  static getType() {
    return "composer-emoji";
  }

  static clone(node: ComposerEmojiNode) {
    return new ComposerEmojiNode(node.__token, node.__name, node.__src, node.__key);
  }

  static importJSON(serializedNode: SerializedComposerEmojiNode) {
    return $createComposerEmojiNode(
      serializedNode.token,
      serializedNode.name,
      serializedNode.src,
    );
  }

  constructor(token: string, name: string, src: string, key?: NodeKey) {
    super(key);
    this.__name = name;
    this.__src = src;
    this.__token = token;
  }

  createDOM() {
    const span = document.createElement("span");
    span.className = "inline-flex align-[-0.35em]";
    return span;
  }

  updateDOM() {
    return false;
  }

  decorate() {
    return (
      <img
        alt={this.__token}
        className="mx-0.5 inline-block size-6 align-[-0.35em]"
        draggable={false}
        src={this.__src}
        title={this.__name}
      />
    );
  }

  exportJSON(): SerializedComposerEmojiNode {
    return {
      name: this.__name,
      src: this.__src,
      token: this.__token,
      type: ComposerEmojiNode.getType(),
      version: 1,
    };
  }

  getName() {
    return this.__name;
  }

  getSrc() {
    return this.__src;
  }

  getTextContent() {
    return this.__token;
  }

  getToken() {
    return this.__token;
  }

  isInline(): true {
    return true;
  }
}

export class ComposerImageNode extends DecoratorNode<ReactNode> {
  __alt: string;
  __clientId?: string;
  __fileId?: string;
  __height?: number;
  __localUrl?: string;
  __src: string;
  __width?: number;

  static getType() {
    return "composer-image";
  }

  static clone(node: ComposerImageNode) {
    return new ComposerImageNode(
      {
        alt: node.__alt,
        clientId: node.__clientId,
        fileId: node.__fileId,
        height: node.__height,
        localUrl: node.__localUrl,
        src: node.__src,
        width: node.__width,
      },
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedComposerImageNode) {
    return $createComposerImageNode({
      alt: serializedNode.alt,
      clientId: serializedNode.clientId,
      fileId: serializedNode.fileId,
      height: serializedNode.height,
      localUrl: serializedNode.localUrl,
      src: serializedNode.src,
      width: serializedNode.width,
    });
  }

  constructor(
    input: {
      alt: string;
      clientId?: string;
      fileId?: string;
      height?: number;
      localUrl?: string;
      src: string;
      width?: number;
    },
    key?: NodeKey,
  ) {
    super(key);
    this.__alt = input.alt;
    this.__clientId = input.clientId;
    this.__fileId = input.fileId;
    this.__height = input.height;
    this.__localUrl = input.localUrl;
    this.__src = input.src;
    this.__width = input.width;
  }

  createDOM(_config: EditorConfig) {
    const figure = document.createElement("figure");
    figure.className = "my-2 block";
    return figure;
  }

  updateDOM() {
    return false;
  }

  decorate() {
    return (
      <ComposerImagePreview
        alt={this.__alt}
        nodeKey={this.__key}
        src={this.__src}
      />
    );
  }

  exportJSON(): SerializedComposerImageNode {
    return {
      alt: this.__alt,
      clientId: this.__clientId,
      fileId: this.__fileId,
      height: this.__height,
      localUrl: this.__localUrl,
      src: this.__src,
      type: ComposerImageNode.getType(),
      version: 1,
      width: this.__width,
    };
  }

  getAlt() {
    return this.__alt;
  }

  getClientId() {
    return this.__clientId;
  }

  getFileId() {
    return this.__fileId;
  }

  getHeight() {
    return this.__height;
  }

  getLocalUrl() {
    return this.__localUrl;
  }

  getSrc() {
    return this.__src;
  }

  getTextContent() {
    return "";
  }

  getWidth() {
    return this.__width;
  }

  isInline(): false {
    return false;
  }

  updateUploadResult(input: {
    fileId?: string;
    localUrl?: string;
    src: string;
  }) {
    const writable = this.getWritable();
    writable.__fileId = input.fileId;
    writable.__localUrl = input.localUrl ?? writable.__localUrl;
    writable.__src = input.src;
  }
}

export class ComposerMentionNode extends TextNode {
  __displayName: string;
  __isAll: boolean;
  __memberId: string;

  static getType() {
    return "composer-mention";
  }

  static clone(node: ComposerMentionNode) {
    return new ComposerMentionNode(
      {
        displayName: node.__displayName,
        isAll: node.__isAll,
        memberId: node.__memberId,
      },
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedComposerMentionNode) {
    return $createComposerMentionNode({
      displayName: serializedNode.displayName,
      isAll: serializedNode.isAll,
      memberId: serializedNode.memberId,
    });
  }

  constructor(
    input: {
      displayName: string;
      isAll?: boolean;
      memberId: string;
    },
    key?: NodeKey,
  ) {
    super(`@${input.displayName}`, key);
    this.__displayName = input.displayName;
    this.__isAll = input.isAll ?? false;
    this.__memberId = input.memberId;
    this.__mode = 1;
  }

  createDOM(config: EditorConfig) {
    const dom = super.createDOM(config);
    dom.classList.add("text-primary");
    return dom;
  }

  updateDOM() {
    return false;
  }

  exportJSON(): SerializedComposerMentionNode {
    return {
      displayName: this.__displayName,
      isAll: this.__isAll || undefined,
      memberId: this.__memberId,
      ...super.exportJSON(),
      type: ComposerMentionNode.getType(),
      version: 1,
    };
  }

  getDisplayName() {
    return this.__displayName;
  }

  getMemberId() {
    return this.__memberId;
  }

  isAll() {
    return this.__isAll;
  }

  isInline(): true {
    return true;
  }

  canInsertTextBefore() {
    return false;
  }

  canInsertTextAfter() {
    return false;
  }

  isTextEntity() {
    return true;
  }
}

export function $createComposerEmojiNode(
  token: string,
  name: string,
  src: string,
) {
  return $applyNodeReplacement(new ComposerEmojiNode(token, name, src));
}

export function $isComposerEmojiNode(
  node: LexicalNode | null | undefined,
): node is ComposerEmojiNode {
  return node instanceof ComposerEmojiNode;
}

export function $createComposerImageNode(input: {
  alt: string;
  clientId?: string;
  fileId?: string;
  height?: number;
  localUrl?: string;
  src: string;
  width?: number;
}) {
  return $applyNodeReplacement(new ComposerImageNode(input));
}

export function $isComposerImageNode(
  node: LexicalNode | null | undefined,
): node is ComposerImageNode {
  return node instanceof ComposerImageNode;
}

export function $createComposerMentionNode(input: {
  displayName: string;
  isAll?: boolean;
  memberId: string;
}) {
  return $applyNodeReplacement(new ComposerMentionNode(input));
}

export function $isComposerMentionNode(
  node: LexicalNode | null | undefined,
): node is ComposerMentionNode {
  return node instanceof ComposerMentionNode;
}

function ComposerImagePreview({
  alt,
  nodeKey,
  src,
}: {
  alt: string;
  nodeKey: NodeKey;
  src: string;
}) {
  const [editor] = useLexicalComposerContext();
  const isEditable = useLexicalEditable();

  const scrollComposerToBottom = () => {
    window.requestAnimationFrame(() => {
      const rootElement = editor.getRootElement();

      if (!rootElement) {
        return;
      }

      rootElement.scrollTop = rootElement.scrollHeight;
    });
  };

  const removeImage = () => {
    if (!isEditable) {
      return;
    }

    editor.update(() => {
      const node = $getNodeByKey(nodeKey);

      if ($isComposerImageNode(node)) {
        node.remove();
      }
    });
    editor.focus();
  };

  return (
    <span className="relative inline-block max-w-full align-top">
      <img
        alt={alt}
        className="block max-h-44 max-w-60 rounded-lg border border-border object-contain"
        draggable={false}
        onLoad={scrollComposerToBottom}
        src={src}
      />
      <button
        aria-label={`移除图片 ${alt}`}
        className="absolute right-1.5 top-1.5 inline-flex size-[22px] items-center justify-center rounded-full bg-black/55 text-white shadow-sm transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/50 disabled:pointer-events-none disabled:opacity-50"
        disabled={!isEditable}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          removeImage();
        }}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        type="button"
      >
        <HugeiconsIcon
          aria-hidden="true"
          color="currentColor"
          icon={Cancel01Icon}
          size={12}
          strokeWidth={2}
        />
      </button>
    </span>
  );
}
