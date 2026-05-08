export const WECHAT_EMOJI_SOURCE = {
  face: [
    "微笑",
    "撇嘴",
    "色",
    "发呆",
    "得意",
    "流泪",
    "害羞",
    "闭嘴",
    "睡",
    "大哭",
    "尴尬",
    "发怒",
    "调皮",
    "呲牙",
    "惊讶",
    "难过",
    "囧",
    "抓狂",
    "吐",
    "偷笑",
    "愉快",
    "白眼",
    "傲慢",
    "困",
    "惊恐",
    "憨笑",
    "悠闲",
    "咒骂",
    "疑问",
    "嘘",
    "晕",
    "衰",
    "骷髅",
    "敲打",
    "再见",
    "擦汗",
    "抠鼻",
    "鼓掌",
    "坏笑",
    "右哼哼",
    "鄙视",
    "委屈",
    "快哭了",
    "阴险",
    "亲亲",
    "可怜",
    "笑脸",
    "生病",
    "脸红",
    "破涕为笑",
    "恐惧",
    "失望",
    "无语",
    "嘿哈",
    "捂脸",
    "机智",
    "皱眉",
    "耶",
    "吃瓜",
    "加油",
    "汗",
    "天啊",
    "Emm",
    "社会社会",
    "旺柴",
    "好的",
    "打脸",
    "哇",
    "翻白眼",
    "666",
    "让我看看",
    "叹气",
    "苦涩",
    "裂开",
    "奸笑",
  ],
  gesture: ["握手", "胜利", "抱拳", "勾引", "拳头", "OK", "合十", "强", "拥抱", "弱"],
  animal: ["猪头", "跳跳", "发抖", "转圈"],
  blessing: ["庆祝", "礼物", "红包", "發", "福", "烟花", "爆竹"],
  other: ["嘴唇", "爱心", "心碎", "啤酒", "咖啡", "蛋糕", "凋谢", "菜刀", "炸弹", "便便", "太阳", "月亮", "玫瑰"],
} as const;

export type WechatEmojiCategory = keyof typeof WECHAT_EMOJI_SOURCE;
export type WechatEmojiName =
  (typeof WECHAT_EMOJI_SOURCE)[WechatEmojiCategory][number];

export type WechatEmoji = {
  category: WechatEmojiCategory;
  name: WechatEmojiName;
  path: string;
};

export type WechatEmojiTextSegment =
  | {
      type: "emoji";
      value: WechatEmoji;
    }
  | {
      type: "text";
      value: string;
    };

export const WECHAT_EMOJI_CATEGORY_META: Array<{
  id: WechatEmojiCategory;
  label: string;
  previewName: WechatEmojiName;
}> = [
  { id: "face", label: "表情", previewName: "微笑" },
  { id: "gesture", label: "手势", previewName: "强" },
  { id: "animal", label: "动物", previewName: "猪头" },
  { id: "blessing", label: "节庆", previewName: "庆祝" },
  { id: "other", label: "其他", previewName: "爱心" },
];

const WECHAT_EMOJI_CATEGORY_ORDER: WechatEmojiCategory[] = [
  "face",
  "gesture",
  "animal",
  "blessing",
  "other",
];

const EMOJI_TOKEN_PATTERN = /\[([^[\]]+)\]/g;
const emojiBaseUrl = resolveWechatEmojiBaseUrl();

const emojiMap = new Map<string, WechatEmoji>();

export const WECHAT_EMOJIS: WechatEmoji[] = WECHAT_EMOJI_CATEGORY_ORDER.flatMap(
  (category) =>
    WECHAT_EMOJI_SOURCE[category].map((name) => {
      const emoji: WechatEmoji = {
        category,
        name,
        path: `${emojiBaseUrl}/${category}/${name}.png`,
      };

      emojiMap.set(name, emoji);

      return emoji;
    }),
);

export function getWechatEmojiByName(name: string) {
  return emojiMap.get(name) ?? null;
}

export function getWechatEmojisByCategory(category: WechatEmojiCategory) {
  return WECHAT_EMOJIS.filter((emoji) => emoji.category === category);
}

export function toWechatEmojiToken(name: WechatEmojiName) {
  return `[${name}]`;
}

export function parseWechatEmojiText(
  text: string,
): WechatEmojiTextSegment[] {
  const segments: WechatEmojiTextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(EMOJI_TOKEN_PATTERN)) {
    const matchedToken = match[0];
    const matchedName = match[1] ?? "";
    const start = match.index ?? 0;
    const emoji = getWechatEmojiByName(matchedName);

    if (!emoji) {
      continue;
    }

    if (start > cursor) {
      segments.push({
        type: "text",
        value: text.slice(cursor, start),
      });
    }

    segments.push({
      type: "emoji",
      value: emoji,
    });
    cursor = start + matchedToken.length;
  }

  if (cursor < text.length) {
    segments.push({
      type: "text",
      value: text.slice(cursor),
    });
  }

  if (segments.length === 0) {
    segments.push({
      type: "text",
      value: text,
    });
  }

  return segments;
}

function resolveWechatEmojiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_WECHAT_EMOJI_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  return "https://b0.dtminds.com/wechat-emojis";
}
