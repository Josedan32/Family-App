import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { DataTable } from "../ui/DataTable";

const rows = [
  { id: "1", name: "Mercado", amount: "$ 80.000", date: "12 sep" },
  { id: "2", name: "Arriendo", amount: "$ 900.000", date: "1 sep" },
];

type Row = (typeof rows)[number];

const columns = [
  { header: "Detalle", cell: (row: Row) => row.name },
  { header: "Monto", cell: (row: Row) => row.amount, align: "end" as const },
  { header: "Fecha", cell: (row: Row) => row.date, hideOnMobile: true },
];

describe("DataTable", () => {
  it("renders a real table with a header and one row per item", () => {
    render(<DataTable caption="Gastos" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const table = screen.getByRole("table", { name: "Gastos" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Detalle",
      "Monto",
      "Fecha",
    ]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });

  it("hides secondary columns on a phone and summarizes them under the title", () => {
    render(
      <DataTable
        caption="Gastos"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        mobileDetail={(r) => `Comida · ${r.date}`}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Fecha" })).toHaveClass("hidden", "md:table-cell");
    expect(screen.getByRole("columnheader", { name: "Monto" })).not.toHaveClass("hidden");
    expect(screen.getByText("Comida · 12 sep")).toHaveClass("md:hidden");
  });

  it("links each row to its detail page, and the whole row is tappable", () => {
    push.mockClear();
    render(
      <DataTable
        caption="Gastos"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/finanzas/movimientos/${r.id}`}
      />,
    );
    expect(screen.getByRole("link", { name: "Mercado" })).toHaveAttribute(
      "href",
      "/finanzas/movimientos/1",
    );

    fireEvent.click(screen.getByText("$ 900.000"));
    expect(push).toHaveBeenCalledWith("/finanzas/movimientos/2");
  });

  it("opens a row's detail in place when there is no page, one row at a time", () => {
    render(
      <DataTable
        caption="Gastos"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        renderExpanded={(r) => <p>Detalle de {r.name}</p>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mercado" }));
    expect(screen.getByText("Detalle de Mercado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mercado" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Arriendo" }));
    expect(screen.queryByText("Detalle de Mercado")).not.toBeInTheDocument();
    expect(screen.getByText("Detalle de Arriendo")).toBeInTheDocument();
  });
});
