import { describe, expect, it } from "vitest";

import { deriveBreadcrumb } from "../breadcrumb";

describe("deriveBreadcrumb", () => {
  it("labels each known segment and links to its cumulative path", () => {
    expect(deriveBreadcrumb("/hogar/gastos")).toEqual([
      { href: "/hogar", label: "Hogar" },
      { href: "/hogar/gastos", label: "Gastos" },
    ]);
  });

  it("drops a dynamic segment (e.g. a member id) but keeps the parent crumb", () => {
    expect(deriveBreadcrumb("/hogar/miembros/3f2e1a9c-uuid")).toEqual([
      { href: "/hogar", label: "Hogar" },
      { href: "/hogar/miembros", label: "Miembros" },
    ]);
  });

  it("labels the tareas admin route", () => {
    expect(deriveBreadcrumb("/tareas/admin")).toEqual([
      { href: "/tareas", label: "Tareas" },
      { href: "/tareas/admin", label: "Administrar" },
    ]);
  });

  it("returns an empty trail for the root path", () => {
    expect(deriveBreadcrumb("/")).toEqual([]);
  });

  it("returns an empty trail when no segment is recognized", () => {
    expect(deriveBreadcrumb("/unknown-route")).toEqual([]);
  });

  it("ignores a trailing slash", () => {
    expect(deriveBreadcrumb("/hogar/gastos/")).toEqual([
      { href: "/hogar", label: "Hogar" },
      { href: "/hogar/gastos", label: "Gastos" },
    ]);
  });
});
