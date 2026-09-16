import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CatalogueEditor } from "../chores/CatalogueEditor";

function setup(items: string[], max?: number) {
  const onChange = vi.fn();
  render(
    <CatalogueEditor
      label="Pasos"
      addLabel="Añadir paso"
      items={items}
      onChange={onChange}
      max={max}
    />,
  );
  return onChange;
}

describe("CatalogueEditor", () => {
  it("says so plainly when the list is empty", () => {
    setup([]);
    expect(screen.getByText("Todavía no hay nada.")).toBeInTheDocument();
  });

  it("adds an empty line to type into", () => {
    const onChange = setup(["Uno"]);
    fireEvent.click(screen.getByRole("button", { name: "Añadir paso" }));
    expect(onChange).toHaveBeenCalledWith(["Uno", ""]);
  });

  it("edits a line in place", () => {
    const onChange = setup(["Uno", "Dos"]);
    fireEvent.change(screen.getByLabelText("Pasos 2"), {
      target: { value: "Dos y medio" },
    });
    expect(onChange).toHaveBeenCalledWith(["Uno", "Dos y medio"]);
  });

  it("removes a line", () => {
    const onChange = setup(["Uno", "Dos", "Tres"]);
    fireEvent.click(screen.getByRole("button", { name: "Quitar Pasos 2" }));
    expect(onChange).toHaveBeenCalledWith(["Uno", "Tres"]);
  });

  it("reorders, because steps are instructions and not a set", () => {
    const onChange = setup(["Uno", "Dos", "Tres"]);
    fireEvent.click(screen.getByRole("button", { name: "Subir Pasos 3" }));
    expect(onChange).toHaveBeenCalledWith(["Uno", "Tres", "Dos"]);
  });

  it("cannot move the ends off the list", () => {
    setup(["Uno", "Dos"]);
    expect(screen.getByRole("button", { name: "Subir Pasos 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar Pasos 2" })).toBeDisabled();
  });

  it("stops offering to add once the cap is reached", () => {
    setup(["Uno", "Dos"], 2);
    expect(screen.queryByRole("button", { name: "Añadir paso" })).toBeNull();
    expect(screen.getByText(/Máximo 2/)).toBeInTheDocument();
  });

  it("caps each line at the length the API accepts", () => {
    setup(["Uno"]);
    expect(screen.getByLabelText("Pasos 1")).toHaveAttribute("maxLength", "120");
  });
});
