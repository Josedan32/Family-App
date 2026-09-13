import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EffortSlider } from "../chores/EffortSlider";

describe("EffortSlider", () => {
  it("shows the current value out of ten", () => {
    render(<EffortSlider value={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("de 10")).toBeInTheDocument();
  });

  it("exposes the value on the slider role for assistive tech", () => {
    render(<EffortSlider value={3} />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "3");
  });

  it("calls onChange with the points of the clicked bar", () => {
    const onChange = vi.fn();
    render(<EffortSlider value={1} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("7 puntos de esfuerzo"));
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("uses the singular for one point", () => {
    render(<EffortSlider value={1} onChange={vi.fn()} />);
    expect(screen.getByLabelText("1 punto de esfuerzo")).toBeInTheDocument();
  });

  it("moves by one with the arrow keys", () => {
    const onChange = vi.fn();
    render(<EffortSlider value={5} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("never calls onChange when disabled", () => {
    const onChange = vi.fn();
    render(<EffortSlider value={5} onChange={onChange} disabled />);
    fireEvent.click(screen.getByLabelText("7 puntos de esfuerzo"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
