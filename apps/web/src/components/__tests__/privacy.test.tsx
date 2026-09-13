import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PrivateBlock } from "../privacy/PrivateBlock";
import { VisibilityBadge } from "../privacy/VisibilityBadge";

describe("VisibilityBadge", () => {
  it.each([
    ["private", "Privado"],
    ["summary", "Resumen"],
    ["public", "Público"],
  ] as const)("labels %s in Spanish", (level, label) => {
    render(<VisibilityBadge level={level} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("does not rely on color alone", () => {
    render(<VisibilityBadge level="private" />);
    // A text label plus an icon, so a color-blind reader still gets the state.
    expect(screen.getByText("Privado")).toBeInTheDocument();
    expect(screen.getByTestId("visibility-icon")).toBeInTheDocument();
  });
});

describe("PrivateBlock", () => {
  it("says Privado", () => {
    render(<PrivateBlock />);
    expect(screen.getByText("Privado")).toBeInTheDocument();
  });

  it("names the owner when known, reframing it as their decision", () => {
    render(<PrivateBlock member="Julián" />);
    expect(screen.getByText("Julián decidió no compartir este monto")).toBeInTheDocument();
  });

  it("says only Privado when the owner is not known", () => {
    render(<PrivateBlock />);
    expect(screen.queryByText(/decidió no compartir/)).toBeNull();
  });

  it("renders no number at all", () => {
    const { container } = render(<PrivateBlock member="Julián" />);
    // Not a blurred figure (invites guessing at magnitude), not $— , not 0.
    expect(container.textContent).not.toMatch(/\d/);
    expect(container.textContent).not.toContain("$");
  });

  it("is not a loading skeleton", () => {
    // A skeleton implies data is coming. This data is not coming.
    const { container } = render(<PrivateBlock />);
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("does not apply a blur filter", () => {
    const { container } = render(<PrivateBlock />);
    expect(container.innerHTML).not.toContain("blur");
  });
});
