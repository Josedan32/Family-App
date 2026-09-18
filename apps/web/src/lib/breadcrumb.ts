export interface Crumb {
  href: string;
  label: string;
}

// Canonical Spanish labels per docs/glossary.md, one per known route
// segment. A segment with no entry here (a dynamic route param such as a
// member id) is dropped from the trail rather than shown raw — the
// preceding crumb still links to a valid route.
const SEGMENT_LABELS: Record<string, string> = {
  hogar: "Hogar",
  gastos: "Gastos",
  miembros: "Miembros",
  tareas: "Tareas",
  admin: "Administrar",
  aportes: "Aportes",
  periodos: "Periodos",
  finanzas: "Finanzas",
  prestamos: "Préstamos",
  ajustes: "Ajustes",
  privacidad: "Privacidad",
  perfil: "Perfil",
  ausencias: "Ausencias",
};

/**
 * Derives a breadcrumb trail from a pathname, e.g. "/hogar/gastos" ->
 * [{ href: "/hogar", label: "Hogar" }, { href: "/hogar/gastos", label: "Gastos" }].
 */
export function deriveBreadcrumb(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];
  let href = "";
  for (const segment of segments) {
    const label = SEGMENT_LABELS[segment];
    if (!label) continue;
    href += `/${segment}`;
    crumbs.push({ href, label });
  }
  return crumbs;
}
