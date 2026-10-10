// CSV build + browser download helpers. Pure client-side — no API route needed.

export type CsvColumn = { key: string; header: string };

/** Escape a single CSV cell per RFC 4180 (wrap in quotes, double-up inner quotes). */
function escapeCell(value: unknown): string {
  const s =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean" || typeof value === "bigint"
          ? String(value)
          : value instanceof Date
            ? value.toISOString()
            : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a CSV string from an array of plain objects.
 * If `columns` is omitted, derive headers from the union of row keys (first-seen order).
 */
export function toCSV(rows: ReadonlyArray<Record<string, unknown>>, columns?: CsvColumn[]): string {
  const cols: CsvColumn[] = columns
    ? columns
    : Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).map((key) => ({ key, header: key }));
  const header = cols.map((c) => escapeCell(c.header)).join(",");
  const body = rows.map((r) => cols.map((c) => escapeCell(r[c.key])).join(","));
  return [header, ...body].join("\r\n");
}

/**
 * Build a CSV Blob in-browser and trigger a download via a temporary anchor.
 * Safe to call from any client click handler.
 */
export function downloadCSV(filename: string, rows: ReadonlyArray<Record<string, unknown>>, columns?: CsvColumn[]): void {
  const csv = toCSV(rows, columns);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.toLowerCase().endsWith(".csv") ? filename : `${filename}.csv`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
