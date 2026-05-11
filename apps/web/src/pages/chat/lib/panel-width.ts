export const DEFAULT_CUSTOMER_PANEL_WIDTH = 375;
export const MIN_CUSTOMER_PANEL_WIDTH = 375;
export const MAX_CUSTOMER_PANEL_WIDTH = 420;
export const MIN_MESSAGE_PANEL_WIDTH = 520;
export const CUSTOMER_PANEL_RESIZE_HANDLE_WIDTH = 4;
export const CONVERSATION_LIST_PANEL_WIDTH = 256;
// Product floor for the horizontal workbench. This intentionally allows a small
// compression range before horizontal scrolling starts.
export const MIN_WORKBENCH_CONTENT_WIDTH = 1100;

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
