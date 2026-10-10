// Print helpers for the Tau Power ERP.
// The app chrome (sidebar / header / footer) is hidden via `.no-print` in
// globals.css; printable content is wrapped in a `.print-area` element so the
// existing `@media print { .print-area, .print-area * { visibility: visible } }`
// rule reveals it on paper. This helper just kicks the browser print dialog.

/**
 * Open the browser print dialog scoped to the printable area. The layout's
 * `@media print` block hides everything else (sidebar/header/footer carry
 * `.no-print`); whatever is wrapped in `.print-area` becomes the only visible
 * content on the page.
 */
export function printInvoice(): void {
  if (typeof window !== "undefined") {
    window.print();
  }
}

/**
 * Compress a list of serial numbers (or other prefixed numeric tokens) into
 * compact range notation. Numbers that share a non-numeric prefix and form a
 * contiguous run are merged into a "from to to" range.
 *
 *   ["NOX-001","NOX-002","NOX-003","NOX-007"]
 *     → "NOX-001 to NOX-003, NOX-007"
 *
 *   ["EGT-010","EGT-011","BADGE-X","EGT-012"]
 *     → "EGT-010 to EGT-012, BADGE-X"
 *
 * The sort uses natural numeric ordering so NOX-002 comes before NOX-010.
 * Tokens without a trailing numeric suffix are emitted verbatim in their
 * natural sort position.
 */
export function formatSerialRange(serials: string[]): string {
  if (!serials.length) return "";

  const sorted = [...serials].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );

  type Group = {
    literal: boolean;
    prefix: string;
    from: number;
    to: number;
    pad: number;
  };

  const groups: Group[] = [];
  for (const s of sorted) {
    const m = s.match(/^(.*?)(\d+)$/);
    if (!m) {
      groups.push({ literal: true, prefix: s, from: NaN, to: NaN, pad: 0 });
      continue;
    }
    const prefix = m[1];
    const num = parseInt(m[2], 10);
    const pad = m[2].length;
    const last = groups[groups.length - 1];
    if (
      last &&
      !last.literal &&
      last.prefix === prefix &&
      last.pad === pad &&
      last.to + 1 === num
    ) {
      last.to = num;
    } else {
      groups.push({ literal: false, prefix, from: num, to: num, pad });
    }
  }

  const fmt = (n: number, pad: number) => n.toString().padStart(pad, "0");
  return groups
    .map((g) => {
      if (g.literal) return g.prefix;
      if (g.from === g.to) return `${g.prefix}${fmt(g.from, g.pad)}`;
      return `${g.prefix}${fmt(g.from, g.pad)} to ${g.prefix}${fmt(g.to, g.pad)}`;
    })
    .join(", ");
}
