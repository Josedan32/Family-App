import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataTable } from "../ui/DataTable";

const rows = [
  { id: "1", name: "Mercado", amount: "$ 80.000" },
  { id: "2", name: "Arriendo", amount: "$ 900.000" },
];

const columns = [
  { header: "Detalle", cell: (row: (typeof rows)[number]) => row.name },
  { header: "Monto", cell: (row: (typeof rows)[number]) => row.amount, align: "end" as const },
];

describe("DataTable", () => {
  it("renders a real table with a header and one row per item", () => {
    render(<DataTable caption="Gastos" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const table = screen.getByRole("table", { name: "Gastos" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Detalle",
      "Monto",
    ]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });

  it("opens a row's detail on demand, one row at a time", () => {
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
