import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, vi } from "vitest";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  installLocalStorageMock();

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

afterEach(() => {
  cleanup();
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
