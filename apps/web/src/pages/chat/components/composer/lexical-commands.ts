import { createCommand } from "lexical";
import type { WechatEmoji } from "@/pages/chat/wechat-emoji";

export type InsertComposerImagePayload = {
  alt: string;
  height?: number;
  localUrl?: string;
  src: string;
  width?: number;
};

export const INSERT_COMPOSER_EMOJI_COMMAND = createCommand<WechatEmoji>(
  "INSERT_COMPOSER_EMOJI_COMMAND",
);

export const INSERT_COMPOSER_IMAGE_COMMAND =
  createCommand<InsertComposerImagePayload>("INSERT_COMPOSER_IMAGE_COMMAND");

export const CLEAR_COMPOSER_COMMAND = createCommand<void>("CLEAR_COMPOSER_COMMAND");
