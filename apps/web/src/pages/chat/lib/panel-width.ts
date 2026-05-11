export const DEFAULT_CUSTOMER_PANEL_WIDTH = 304;
export const MIN_CUSTOMER_PANEL_WIDTH = 256;
export const MAX_CUSTOMER_PANEL_WIDTH = 420;
export const MIN_MESSAGE_PANEL_WIDTH = 520;
export const CUSTOMER_PANEL_RESIZE_HANDLE_WIDTH = 4;
export const MIN_CUSTOMER_PANEL_VISIBLE_WIDTH =
  MIN_MESSAGE_PANEL_WIDTH +
  MIN_CUSTOMER_PANEL_WIDTH +
  CUSTOMER_PANEL_RESIZE_HANDLE_WIDTH;

export function shouldShowCustomerPanel(availableWidth: number) {
  return availableWidth >= MIN_CUSTOMER_PANEL_VISIBLE_WIDTH;
}

export function clampCustomerPanelWidth(width: number, availableWidth: number) {
  const maxWidth = Math.min(
    MAX_CUSTOMER_PANEL_WIDTH,
    Math.max(
      MIN_CUSTOMER_PANEL_WIDTH,
      availableWidth - MIN_MESSAGE_PANEL_WIDTH - CUSTOMER_PANEL_RESIZE_HANDLE_WIDTH,
    ),
  );

  return Math.min(Math.max(width, MIN_CUSTOMER_PANEL_WIDTH), maxWidth);
}
