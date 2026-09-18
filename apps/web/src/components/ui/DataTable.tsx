"use client";

import { Fragment, useState } from "react";

export interface Column<Row> {
  header: string;
  cell: (row: Row) => React.ReactNode;
  align?: "start" | "end";
  /** Keep short values (dates, amounts) on one line. */
  nowrap?: boolean;
}

/**
 * A plain table for the "Tablas" view mode. It scrolls sideways inside its
 * own box on a narrow screen instead of widening the page.
 *
 * With `renderExpanded`, the first cell becomes a button that opens that
 * row's detail underneath — the same card the "Tarjetas" mode shows, with
 * its edit and delete actions, so the table never duplicates them.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  renderExpanded,
  rowClassName,
}: {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  renderExpanded?: (row: Row) => React.ReactNode;
  rowClassName?: (row: Row) => string;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-sunken text-left">
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={`whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted ${
                  column.align === "end" ? "text-right" : ""
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const open = openKey === key;
            return (
              <Fragment key={key}>
                <tr
                  className={`border-b border-border last:border-b-0 ${rowClassName?.(row) ?? ""}`}
                >
                  {columns.map((column, index) => (
                    <td
                      key={column.header}
                      className={`px-3 py-2.5 align-top ${
                        column.align === "end" ? "text-right tabular" : ""
                      } ${column.nowrap ? "whitespace-nowrap" : ""}`}
                    >
                      {index === 0 && renderExpanded ? (
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setOpenKey(open ? null : key)}
                          className="text-left font-semibold text-brand"
                        >
                          {column.cell(row)}
                        </button>
                      ) : (
                        column.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
                {open && renderExpanded ? (
                  <tr className="border-b border-border bg-surface-sunken">
                    <td colSpan={columns.length} className="p-3">
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
