import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GoalCard, type Goal } from "../finance/GoalCard";

const base: Goal = {
  id: "1",
  name: "Moto",
  target_amount_minor: 100_000,
  balance_minor: 50_000,
  progress: 0.5,
  currency: "COP",
  priority: "media",
  target_date: null,
  days_remaining: null,
  is_overdue: false,
  state: "en_progreso",
  used_on: null,
};

describe("GoalCard", () => {
  it("shows the goal's priority", () => {
    render(<GoalCard goal={{ ...base, priority: "alta" }} />);
    expect(screen.getByText("Prioridad Alta")).toBeInTheDocument();
  });

  it("shows the achieved state ahead of an overdue deadline", () => {
    render(
      <GoalCard
        goal={{ ...base, state: "completado", is_overdue: true, days_remaining: -5 }}
      />,
    );
    expect(screen.getByText("Meta alcanzada")).toBeInTheDocument();
    expect(screen.queryByText("Plazo vencido")).not.toBeInTheDocument();
  });

  it("shows an overdue deadline when the goal is unmet", () => {
    render(<GoalCard goal={{ ...base, is_overdue: true, days_remaining: -3 }} />);
    expect(screen.getByText("Plazo vencido")).toBeInTheDocument();
  });

  it("shows the days remaining when in progress with a deadline ahead", () => {
    render(<GoalCard goal={{ ...base, days_remaining: 14 }} />);
    expect(screen.getByText("14 días restantes")).toBeInTheDocument();
  });

  it("shows no deadline state when the goal has no target date", () => {
    render(<GoalCard goal={base} />);
    expect(screen.queryByText("Meta alcanzada")).not.toBeInTheDocument();
    expect(screen.queryByText("Plazo vencido")).not.toBeInTheDocument();
    expect(screen.queryByText(/días restantes/)).not.toBeInTheDocument();
  });

  it("displays priority as Baja once the goal is completed, without touching the stored priority", () => {
    render(<GoalCard goal={{ ...base, priority: "alta", state: "completado" }} />);
    expect(screen.getByText("Prioridad Baja")).toBeInTheDocument();
  });

  it("keeps the real priority when merely overdue, not completed", () => {
    render(<GoalCard goal={{ ...base, priority: "alta", is_overdue: true }} />);
    expect(screen.getByText("Prioridad Alta")).toBeInTheDocument();
  });

  it("shows a used goal as used, with the date, instead of as reached", () => {
    render(
      <GoalCard
        goal={{ ...base, balance_minor: 100_000, progress: 1, state: "usada", used_on: "2026-08-20" }}
      />,
    );
    expect(screen.getByText("Usada el 20 ago 2026")).toBeInTheDocument();
    expect(screen.queryByText("Meta alcanzada")).not.toBeInTheDocument();
    // It no longer competes for attention: no priority pill at all.
    expect(screen.queryByText(/Prioridad/)).not.toBeInTheDocument();
  });
});
