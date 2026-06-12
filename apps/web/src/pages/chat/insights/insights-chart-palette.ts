export const insightChartColors = {
  axis: "#a1a1aa",
  primary: "#5b5ff0",
  topic: [
    "#5b5ff0",
    "#14a6a6",
    "#e7a23b",
    "#e36f5c",
    "#7b61d9",
    "#2f8bc9",
    "#58a65c",
    "#c16d9b",
    "#b58a3b",
    "#6f8fbc",
  ],
} as const;

export const insightDimensionColors = {
  asset: "#0891b2",
  entity: "#f0a337",
  intent: "#5b5ff0",
  tag: "#16a36a",
} as const;

export const insightResolutionColors = {
  noCustomerProblem: "#c9cdd3",
  partiallyResolved: "#f0a337",
  resolved: "#16a36a",
  unknown: "#94a3b8",
  unresolved: "#df3f40",
} as const;

export const insightQualityRuleColors = [
  insightResolutionColors.unresolved,
  insightResolutionColors.partiallyResolved,
  insightChartColors.primary,
  "#14a6a6",
  "#7b61d9",
  "#2f8bc9",
  "#58a65c",
  "#c16d9b",
] as const;
