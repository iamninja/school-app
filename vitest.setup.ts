/// <reference types="@testing-library/jest-dom" />
import { expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

// jsdom doesn't implement ResizeObserver, but Radix primitives (e.g.
// RadioGroup's Indicator, via @radix-ui/react-use-size) use it internally.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverMock as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
});
