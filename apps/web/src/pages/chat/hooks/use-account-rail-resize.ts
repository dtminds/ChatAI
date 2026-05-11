import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_ACCOUNT_RAIL_WIDTH,
  clampAccountRailWidth,
} from "@/pages/chat/lib/account-rail-width";

export const ACCOUNT_RAIL_WIDTH_STORAGE_KEY = "chatai.accountRailWidth";

function readAccountRailWidth() {
  try {
    const savedWidth = window.localStorage.getItem(ACCOUNT_RAIL_WIDTH_STORAGE_KEY);

    if (!savedWidth) {
      return DEFAULT_ACCOUNT_RAIL_WIDTH;
    }

    return clampAccountRailWidth(Number(savedWidth));
  } catch {
    return DEFAULT_ACCOUNT_RAIL_WIDTH;
  }
}

function writeAccountRailWidth(width: number) {
  try {
    window.localStorage.setItem(ACCOUNT_RAIL_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // Width persistence is best-effort; the current session still updates.
  }
}

export function useAccountRailResize() {
  const [accountRailWidth, setAccountRailWidth] = useState(readAccountRailWidth);
  const [isResizingAccountRail, setIsResizingAccountRail] = useState(false);
  const latestWidthRef = useRef(accountRailWidth);
  const animationFrameRef = useRef<number | null>(null);
  const resizeStartRef = useRef({ pointerX: 0, width: DEFAULT_ACCOUNT_RAIL_WIDTH });

  useEffect(() => {
    document.body.style.cursor = isResizingAccountRail ? "col-resize" : "";
    document.body.style.userSelect = isResizingAccountRail ? "none" : "";

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizingAccountRail]);

  useEffect(() => {
    if (!isResizingAccountRail) {
      return;
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = clampAccountRailWidth(
        resizeStartRef.current.width +
          moveEvent.clientX -
          resizeStartRef.current.pointerX,
      );

      latestWidthRef.current = nextWidth;

      if (animationFrameRef.current !== null) {
        return;
      }

      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = null;
        setAccountRailWidth(latestWidthRef.current);
      });
    };

    const handlePointerUp = () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      setAccountRailWidth(latestWidthRef.current);
      setIsResizingAccountRail(false);
      writeAccountRailWidth(latestWidthRef.current);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingAccountRail]);

  const handleAccountRailResizeStart = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    resizeStartRef.current = {
      pointerX: event.clientX,
      width: accountRailWidth,
    };
    latestWidthRef.current = accountRailWidth;
    setIsResizingAccountRail(true);
  };

  return {
    accountRailWidth,
    handleAccountRailResizeStart,
    isResizingAccountRail,
  };
}
