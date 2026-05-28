import { createCommand } from "lexical";
import type { WechatEmoji } from "@/pages/chat/wechat-emoji";

export type InsertComposerImagePayload = {
  alt: string;
  clientId?: string;
  height?: number;
  localUrl?: string;
  src: string;
  width?: number;
};

export type UpdateComposerImagePayload = {
  clientId?: string;
  fileId?: string;
  localUrl?: string;
  previousSrc: string;
  src: string;
};

export type InsertComposerMentionPayload = {
  displayName: string;
  memberId: string;
  isAll?: boolean;
};

export const INSERT_COMPOSER_EMOJI_COMMAND = createCommand<WechatEmoji>(
  "INSERT_COMPOSER_EMOJI_COMMAND",
);

export const INSERT_COMPOSER_IMAGE_COMMAND =
  createCommand<InsertComposerImagePayload>("INSERT_COMPOSER_IMAGE_COMMAND");

export const UPDATE_COMPOSER_IMAGE_COMMAND =
  createCommand<UpdateComposerImagePayload>("UPDATE_COMPOSER_IMAGE_COMMAND");

export const INSERT_COMPOSER_MENTION_COMMAND =
  createCommand<InsertComposerMentionPayload>("INSERT_COMPOSER_MENTION_COMMAND");

export const INSERT_COMPOSER_TEXT_COMMAND = createCommand<string>(
  "INSERT_COMPOSER_TEXT_COMMAND",
);

export const CLEAR_COMPOSER_COMMAND = createCommand<void>("CLEAR_COMPOSER_COMMAND");
