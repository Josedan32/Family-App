"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";

import { IconChevronRight } from "@/components/ui/Icons";

export interface Column<Row> {
  header: string;
  cell: (row: Row) => React.ReactNode;
  align?: "start" | "end";
  /** Keep short values (dates, amounts) on one line. */
  nowrap?: boolean;
  /** Secondary detail: on a phone it lives in `mobileDetail` instead. */
  hideOnMobile?: boolean;
}

/**
 * A plain table for the "Tablas" view mode.
 *
 * On a phone it shows only the columns that matter — the rest are marked
 * `hideOnMobile` and summarized under the title by `mobileDetail` — so it
 * never needs sideways scrolling there.
 *
 * A row either opens its detail page (`rowHref`) or, where there is no page,
 * unfolds its card underneath (`renderExpanded`).
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  rowHref,
  renderExpanded,
  mobileDetail,
  rowClassName,
  rowStyle,
}: {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  rowHref?: (row: Row) => string;
  renderExpanded?: (row: Row) => React.ReactNode;
  mobileDetail?: (row: Row) => React.ReactNode;
  rowClassName?: (row: Row) => string;
  rowStyle?: (row: Row) => React.CSSProperties;
}) {
  const router = useRouter();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const hidden = (column: Column<Row>) => (column.hideOnMobile ? "hidden md:table-cell" : "");
  const span = columns.length + (rowHref ? 1 : 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface md:overflow-x-auto">
      <table className="w-full border-collapse text-sm md:min-w-[36rem]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-sunken text-left">
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={`whitespace-nowrap px-3 py-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-text-muted ${
                  column.align === "end" ? "text-right" : ""
                } ${hidden(column)}`}
              >
                {column.header}
              </th>
            ))}
            {rowHref ? <th aria-hidden="true" className="w-6" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const open = openKey === key;
            const href = rowHref?.(row);
            return (
              <Fragment key={key}>
                <tr
                  style={rowStyle?.(row)}
                  onClick={
                    href
                      ? (event) => {
                          // The link in the first cell handles its own click.
                          if ((event.target as HTMLElement).closest("a, button")) return;
                          router.push(href);
                        }
                      : undefined
                  }
                  className={`border-b border-border last:border-b-0 ${
                    href ? "cursor-pointer active:bg-surface-sunken md:hover:bg-surface-sunken" : ""
                  } ${rowClassName?.(row) ?? ""}`}
                >
                  {columns.map((column, index) => (
                    <td
                      key={column.header}
                      className={`px-3 py-3 align-middle ${
                        column.align === "end" ? "text-right tabular" : ""
                      } ${column.nowrap ? "whitespace-nowrap" : ""} ${hidden(column)}`}
                    >
                      {index === 0 ? (
                        <div className="flex min-w-0 flex-col gap-0.5">
                          {href ? (
                            <Link href={href} className="font-semibold">
                              {column.cell(row)}
                            </Link>
                          ) : renderExpanded ? (
                            <button
                              type="button"
                              aria-expanded={open}
                              onClick={() => setOpenKey(open ? null : key)}
                              className="text-left font-semibold text-brand"
                            >
                              {column.cell(row)}
                            </button>
                          ) : (
                            <span className="font-semibold">{column.cell(row)}</span>
                          )}
                          {mobileDetail ? (
                            <span className="text-xs text-text-muted md:hidden">
                              {mobileDetail(row)}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        column.cell(row)
                      )}
                    </td>
                  ))}
                  {href ? (
                    <td aria-hidden="true" className="w-6 pr-2 text-text-muted">
                      <IconChevronRight />
                    </td>
                  ) : null}
                </tr>
                {open && renderExpanded ? (
                  <tr className="border-b border-border bg-surface-sunken">
                    <td colSpan={span} className="p-3">
                      {renderExpanded(row)}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
