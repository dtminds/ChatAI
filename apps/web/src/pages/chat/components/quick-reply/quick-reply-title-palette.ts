export const quickReplyTitlePalette = [
  {
    backgroundColor: "#ffffff",
    borderColor: "var(--border)",
    foregroundColor: "var(--foreground)",
    label: "无",
    value: "",
  },
  {
    backgroundColor: "#ff7a2f",
    borderColor: "#ff7a2f",
    foregroundColor: "#ffffff",
    label: "A",
    value: "orange",
  },
  {
    backgroundColor: "#2dbd2d",
    borderColor: "#2dbd2d",
    foregroundColor: "#ffffff",
    label: "A",
    value: "green",
  },
  {
    backgroundColor: "#1e80ff",
    borderColor: "#1e80ff",
    foregroundColor: "#ffffff",
    label: "A",
    value: "blue",
  },
  {
    backgroundColor: "#e95cff",
    borderColor: "#e95cff",
    foregroundColor: "#ffffff",
    label: "A",
    value: "pink",
  },
  {
    backgroundColor: "#9b5cff",
    borderColor: "#9b5cff",
    foregroundColor: "#ffffff",
    label: "A",
    value: "purple",
  },
  {
    backgroundColor: "#f06f83",
    borderColor: "#f06f83",
    foregroundColor: "#ffffff",
    label: "A",
    value: "rose",
  },
  {
    backgroundColor: "#00a3a3",
    borderColor: "#00a3a3",
    foregroundColor: "#ffffff",
    label: "A",
    value: "teal",
  },
  {
    backgroundColor: "#c58b57",
    borderColor: "#c58b57",
    foregroundColor: "#ffffff",
    label: "A",
    value: "brown",
  },
  {
    backgroundColor: "#59616b",
    borderColor: "#59616b",
    foregroundColor: "#ffffff",
    label: "A",
    value: "slate",
  },
] as const;

export type QuickReplyTitleColor = (typeof quickReplyTitlePalette)[number]["value"];

export function getQuickReplyTitleColor(value: string) {
  return (
    quickReplyTitlePalette.find((color) => color.value === value) ??
    quickReplyTitlePalette[0]
  );
}
