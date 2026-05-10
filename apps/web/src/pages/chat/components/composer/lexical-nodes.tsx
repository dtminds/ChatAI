import type { ReactNode } from "react";
import {
  $applyNodeReplacement,
  DecoratorNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
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
    height?: number;
    localUrl?: string;
    src: string;
    width?: number;
  },
  SerializedLexicalNode
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

  isInline() {
    return true;
  }
}

export class ComposerImageNode extends DecoratorNode<ReactNode> {
  __alt: string;
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
      height: serializedNode.height,
      localUrl: serializedNode.localUrl,
      src: serializedNode.src,
      width: serializedNode.width,
    });
  }

  constructor(
    input: {
      alt: string;
      height?: number;
      localUrl?: string;
      src: string;
      width?: number;
    },
    key?: NodeKey,
  ) {
    super(key);
    this.__alt = input.alt;
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
      <img
        alt={this.__alt}
        className="block max-h-44 max-w-60 rounded-lg border border-border object-contain"
        draggable={false}
        src={this.__src}
      />
    );
  }

  exportJSON(): SerializedComposerImageNode {
    return {
      alt: this.__alt,
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
