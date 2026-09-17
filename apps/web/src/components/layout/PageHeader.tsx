"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { IconArrowLeft } from "@/components/ui/Icons";
import { deriveBreadcrumb } from "@/lib/breadcrumb";

/**
 * A back button plus a breadcrumb trail derived from the current route, for
 * sub-pages that have no other way back. `router.back()` returns to
 * wherever the member actually came from, unlike a Link to a fixed parent.
 */
export function PageHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const crumbs = deriveBreadcrumb(pathname);

  return (
    <div className="mb-4 flex items-center gap-2">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Volver"
        className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-text-muted active:bg-surface-sunken active:text-text"
      >
        <IconArrowLeft />
      </button>
      {crumbs.length ? (
        <nav
          aria-label="Ruta de navegación"
          className="flex min-w-0 items-center gap-1 truncate text-sm"
        >
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            return (
              <span key={crumb.href} className="flex items-center gap-1">
                {index > 0 ? (
                  <span aria-hidden="true" className="text-text-muted">
                    /
                  </span>
                ) : null}
                {isLast ? (
                  <span className="font-medium text-text">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} className="text-text-muted active:text-brand">
                    {crumb.label}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
