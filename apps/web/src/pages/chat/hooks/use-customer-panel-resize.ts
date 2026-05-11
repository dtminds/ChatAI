import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useState,
} from "react";
import {
  DEFAULT_CUSTOMER_PANEL_WIDTH,
  clampCustomerPanelWidth,
  shouldShowCustomerPanel,
} from "@/pages/chat/lib/panel-width";

export function useCustomerPanelResize(
  workbenchBodyRef: RefObject<HTMLDivElement | null>,
) {
  const [customerPanelWidth, setCustomerPanelWidth] = useState(
    DEFAULT_CUSTOMER_PANEL_WIDTH,
  );
  const [isCustomerPanelVisible, setIsCustomerPanelVisible] = useState(true);
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
    const syncCustomerPanelLayout = (availableWidth: number) => {
      if (!availableWidth) {
        return;
      }

      setIsCustomerPanelVisible(shouldShowCustomerPanel(availableWidth));
      setCustomerPanelWidth((currentWidth) =>
        clampCustomerPanelWidth(currentWidth, availableWidth),
      );
    };

    const workbenchBody = workbenchBodyRef.current;

    if (!workbenchBody) {
      return;
    }

    syncCustomerPanelLayout(workbenchBody.clientWidth);

    if (typeof ResizeObserver === "undefined") {
      const handleWindowResize = () => {
        syncCustomerPanelLayout(workbenchBody.clientWidth);
      };

      window.addEventListener("resize", handleWindowResize);

      return () => {
        window.removeEventListener("resize", handleWindowResize);
      };
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      syncCustomerPanelLayout(entry.contentRect.width);
    });

    resizeObserver.observe(workbenchBody);

    return () => {
      resizeObserver.disconnect();
    };
  }, [workbenchBodyRef]);

  useEffect(() => {
    if (!isResizingCustomerPanel) {
      return;
    }

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
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingCustomerPanel, workbenchBodyRef]);

  const handleCustomerPanelResizeStart = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    setIsResizingCustomerPanel(true);
  };

  return {
    customerPanelWidth,
    handleCustomerPanelResizeStart,
    isCustomerPanelVisible,
    isResizingCustomerPanel,
  };
}
