import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, vi } from "vitest";
import {
  createMockWorkbenchService,
  setWorkbenchService,
} from "../src/pages/chat/api/workbench-service";

expect.extend(matchers);

beforeAll(() => {
  if (typeof window === "undefined") {
    return;
  }

  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  installLocalStorageMock();

  const emptyRect = () => ({
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    toJSON: () => ({}),
    top: 0,
    width: 0,
    x: 0,
    y: 0,
  });

  if (!("getBoundingClientRect" in window.Range.prototype)) {
    Object.defineProperty(window.Range.prototype, "getBoundingClientRect", {
      writable: true,
      value: vi.fn(emptyRect),
    });
  }

  if (!("getClientRects" in window.Range.prototype)) {
    Object.defineProperty(window.Range.prototype, "getClientRects", {
      writable: true,
      value: vi.fn(() => []),
    });
  }

  if (!("getBoundingClientRect" in window.Node.prototype)) {
    Object.defineProperty(window.Node.prototype, "getBoundingClientRect", {
      writable: true,
      value: vi.fn(emptyRect),
    });
  }

  if (!("ClipboardEvent" in window)) {
    class ClipboardEventMock extends Event {
      clipboardData: DataTransfer | null = null;
    }

    Object.defineProperty(window, "ClipboardEvent", {
      writable: true,
      value: ClipboardEventMock,
    });
    Object.defineProperty(globalThis, "ClipboardEvent", {
      writable: true,
      value: ClipboardEventMock,
    });
  }

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  Object.defineProperty(window, "requestAnimationFrame", {
    writable: true,
    value: vi.fn((callback: FrameRequestCallback) => window.setTimeout(callback, 0)),
  });

  Object.defineProperty(window, "cancelAnimationFrame", {
    writable: true,
    value: vi.fn((id: number) => window.clearTimeout(id)),
  });

  class ResizeObserverMock {
    disconnect = vi.fn();
    observe = vi.fn();
    unobserve = vi.fn();
  }

  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    value: ResizeObserverMock,
  });
});

beforeEach(() => {
  setWorkbenchService(createMockWorkbenchService());
});

afterEach(() => {
  if (typeof window !== "undefined") {
    cleanup();
  }

  setWorkbenchService(createMockWorkbenchService());
});

function installLocalStorageMock() {
  let storage: Record<string, string> = {};
  const localStorageMock: Storage = {
    get length() {
      return Object.keys(storage).length;
    },
    clear: vi.fn(() => {
      storage = {};
    }),
    getItem: vi.fn((key: string) => storage[key] ?? null),
    key: vi.fn((index: number) => Object.keys(storage)[index] ?? null),
    removeItem: vi.fn((key: string) => {
      delete storage[key];
    }),
    setItem: vi.fn((key: string, value: string) => {
      storage[key] = String(value);
    }),
  };

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
}
