export const DEFAULT_CUSTOMER_PANEL_WIDTH = 304;
export const MIN_CUSTOMER_PANEL_WIDTH = 256;
export const MAX_CUSTOMER_PANEL_WIDTH = 420;
export const MIN_MESSAGE_PANEL_WIDTH = 520;

export function clampCustomerPanelWidth(width: number, availableWidth: number) {
  const maxWidth = Math.min(
    MAX_CUSTOMER_PANEL_WIDTH,
    Math.max(MIN_CUSTOMER_PANEL_WIDTH, availableWidth - MIN_MESSAGE_PANEL_WIDTH),
  );

  return Math.min(Math.max(width, MIN_CUSTOMER_PANEL_WIDTH), maxWidth);
}
