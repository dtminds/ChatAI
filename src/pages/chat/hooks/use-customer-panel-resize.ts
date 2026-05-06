import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useState,
} from "react";
import {
  DEFAULT_CUSTOMER_PANEL_WIDTH,
  clampCustomerPanelWidth,
} from "@/pages/chat/lib/panel-width";

export function useCustomerPanelResize(
  workbenchBodyRef: RefObject<HTMLDivElement | null>,
) {
  const [customerPanelWidth, setCustomerPanelWidth] = useState(
    DEFAULT_CUSTOMER_PANEL_WIDTH,
  );
  const [isResizingCustomerPanel, setIsResizingCustomerPanel] = useState(false);

  useEffect(() => {
    document.body.style.cursor = isResizingCustomerPanel ? "col-resize" : "";
    document.body.style.userSelect = isResizingCustomerPanel ? "none" : "";

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizingCustomerPanel]);

  useEffect(() => {
    const syncCustomerPanelWidth = () => {
      const availableWidth = workbenchBodyRef.current?.clientWidth;

      if (!availableWidth) {
        return;
      }

      setCustomerPanelWidth((currentWidth) =>
        clampCustomerPanelWidth(currentWidth, availableWidth),
      );
    };

    syncCustomerPanelWidth();
    window.addEventListener("resize", syncCustomerPanelWidth);

    return () => {
      window.removeEventListener("resize", syncCustomerPanelWidth);
    };
  }, [workbenchBodyRef]);

  const handleCustomerPanelResizeStart = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    setIsResizingCustomerPanel(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const bodyRect = workbenchBodyRef.current?.getBoundingClientRect();

      if (!bodyRect) {
        return;
      }

      setCustomerPanelWidth(
        clampCustomerPanelWidth(bodyRect.right - moveEvent.clientX, bodyRect.width),
      );
    };

    const handlePointerUp = () => {
      setIsResizingCustomerPanel(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  return {
    customerPanelWidth,
    handleCustomerPanelResizeStart,
    isResizingCustomerPanel,
  };
}
