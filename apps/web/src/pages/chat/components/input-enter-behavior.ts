export const INPUT_ENTER_BEHAVIOR_LABELS = {
  newline: "Enter 换行",
  send: "Enter 发送",
} as const;

export const INPUT_ENTER_BEHAVIOR_DESCRIPTIONS = {
  newline: "Enter 换行，Shift + Enter 发送",
  send: "Enter 发送，Shift + Enter 换行",
} as const;

export type InputEnterBehavior = keyof typeof INPUT_ENTER_BEHAVIOR_LABELS;
