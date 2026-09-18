import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VIEW_MODE_STORAGE_KEY, setViewMode, useViewMode } from "../viewMode";

function Probe() {
  return <span data-testid="mode">{useViewMode()}</span>;
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("view mode", () => {
  it("defaults to cards", () => {
    render(<Probe />);
    expect(screen.getByTestId("mode")).toHaveTextContent("cards");
  });

  it("remembers the choice on this device", () => {
    setViewMode("table");
    expect(window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)).toBe("table");
    render(<Probe />);
    expect(screen.getByTestId("mode")).toHaveTextContent("table");
  });

  it("updates every mounted list as soon as it changes", () => {
    render(<Probe />);
    act(() => setViewMode("table"));
    expect(screen.getByTestId("mode")).toHaveTextContent("table");
  });

  it("ignores a stored value it does not know", () => {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, "mosaico");
    render(<Probe />);
    expect(screen.getByTestId("mode")).toHaveTextContent("cards");
  });

  it("falls back to cards when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    render(<Probe />);
    expect(screen.getByTestId("mode")).toHaveTextContent("cards");
  });
});
