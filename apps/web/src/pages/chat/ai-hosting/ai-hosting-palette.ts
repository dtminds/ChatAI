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

export const aiHostingSettingsModuleSurface = {
  background: "linear-gradient(180deg,#FFF9FD_0%,#FFFFFF_24px)",
  border: aiHostingSurfaceColors.border,
  shadow: "0px 1px 2px 0px rgba(0,0,0,0.05)",
} as const;

export const aiHostingPreviewHeaderGradient =
  "linear-gradient(90deg,#FFF8E7_0%,#F8F0FF_52%,#EAF3FF_100%)";

export const aiHostingPreviewMessageColors = {
  bubbleBackground: "#F3F4F6",
} as const;

export const aiHostingPreviewCustomerAvatarColors = {
  background: "#FDE68A",
  text: "#92400E",
} as const;
