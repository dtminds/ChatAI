export const aiHostingSurfaceColors = {
  border: "#E5E5E5",
} as const;

export const aiHostingDraftBannerColors = {
  background: "#EAF3FF",
  icon: "#3B82F6",
  link: "#2563EB",
  linkHover: "#1D4ED8",
} as const;

export const aiHostingGenerateColors = {
  buttonFill: "#ffffff",
  gradientEnd: "#C840D4",
  gradientMid: "#8E33FA",
  gradientStart: "#267FF0",
} as const;

export const aiHostingGenerateGradient =
  `linear-gradient(90deg, ${aiHostingGenerateColors.gradientStart} 0%, ${aiHostingGenerateColors.gradientMid} 55%, ${aiHostingGenerateColors.gradientEnd} 100%)`;

export const aiHostingGenerateButtonBackground =
  `linear-gradient(${aiHostingGenerateColors.buttonFill}, ${aiHostingGenerateColors.buttonFill}) padding-box, ${aiHostingGenerateGradient} border-box`;

export const aiHostingGenerateDialogGlow =
  "radial-gradient(circle,rgba(255,214,165,0.55) 0%,rgba(232,196,255,0.45) 38%,rgba(186,230,253,0.25) 62%,transparent 78%)";
