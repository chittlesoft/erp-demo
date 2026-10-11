/**
 * Server-side gating audit — regression guard for Task 11-b.
 *
 * Scans src/app/api/<recursive>/route.ts for files that export a POST,
 * PATCH, or DELETE handler (the mutating verbs) and verifies each one
 * calls (or imports) a recognised gating marker:
 *   - requireAuth, requireEditor, requireAdmin, requireRole
 *     (the helpers exported from lib/erp/api by Task 10-a)
 *   - getServerSession (the NextAuth primitive, used directly by the
 *     users/[id] and auth/[...nextauth] routes, which count as gated)
 *
 * Exits with code 0 if every mutating route is gated, code 1 otherwise,
 * so it can be wired into CI as a guard.
 *
 * Run:   bun run scripts/audit-gating.ts
 *    or: bunx tsx scripts/audit-gating.ts
 *
 * No external dependencies, only Node fs + path.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const API_DIR = join(ROOT, "src", "app", "api");

/** Methods that mutate server state — must be gated. */
const MUTATING_METHODS = ["POST", "PATCH", "DELETE"] as const;
type MutatingMethod = (typeof MUTATING_METHODS)[number];

/** Substrings that count as a gating marker. Order matters only for the
 *  "which marker matched" reporting — the audit just needs at least one. */
const GATING_MARKERS = [
  "requireAuth",
  "requireEditor",
  "requireAdmin",
  "requireRole",
  "getServerSession",
] as const;

type Finding = {
  file: string;
  methods: MutatingMethod[];
  gated: boolean;
  matchedMarker: string | null;
};

/** Recursively collect every `route.ts` under `dir`. */
function findRouteFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      findRouteFiles(full, acc);
    } else if (entry === "route.ts" || entry === "route.tsx") {
      acc.push(full);
    }
  }
  return acc;
}

/** Pull every `export const FOO = ...` / `export async function FOO` /
 *  `export function FOO` / `export { FOO }` names where FOO is a mutating
 *  HTTP verb (case-insensitive on the verb name? — Next.js requires exact
 *  uppercase, so we only match uppercase). */
function exportedMutatingMethods(src: string): MutatingMethod[] {
  const found: MutatingMethod[] = [];
  for (const m of MUTATING_METHODS) {
    // Match: `export const POST` / `export async function POST` / `export function POST`
    // (anywhitespace between `export` and the identifier). Also catches
    // `export { POST }` re-exports.
    const re = new RegExp(
      `export(?:\\s+(?:const|async\\s+function|function))?\\s+\\{?\\s*${m}\\b`,
    );
    if (re.test(src)) found.push(m);
  }
  return found;
}

/** Returns the first gating marker found in the source, or null if none. */
function findGatingMarker(src: string): string | null {
  for (const marker of GATING_MARKERS) {
    if (src.includes(marker)) return marker;
  }
  return null;
}

function audit(): { findings: Finding[]; gated: number; ungated: number } {
  const files = findRouteFiles(API_DIR);
  const findings: Finding[] = [];
  let gated = 0;
  let ungated = 0;

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const methods = exportedMutatingMethods(src);
    if (methods.length === 0) continue; // GET-only route — skip.
    const matchedMarker = findGatingMarker(src);
    const isGated = matchedMarker !== null;
    if (isGated) gated += 1;
    else ungated += 1;
    findings.push({
      file: relative(ROOT, file),
      methods,
      gated: isGated,
      matchedMarker,
    });
  }

  return { findings, gated, ungated };
}

function main(): void {
  if (!existsSync(API_DIR)) {
    console.error(`✗ API directory not found: ${API_DIR}`);
    console.error("  Run this script from the project root.");
    process.exit(2);
  }

  const { findings, gated, ungated } = audit();
  const total = findings.length;

  console.log("");
  console.log("─".repeat(60));
  console.log(" Server-side gating audit");
  console.log("─".repeat(60));
  console.log(` Scanning:  src/app/api/**/route.{ts,tsx}`);
  console.log(` Mutating:  ${[...MUTATING_METHODS].join(", ")}`);
  console.log(
    ` Markers:   ${[...GATING_MARKERS].join(", ")}`,
  );
  console.log("");
  console.log(
    ` Mutating routes:  ${String(total).padStart(3, " ")}` +
    `   (gated: ${gated}, ungated: ${ungated})`,
  );
  console.log("");

  // Print the gated list (compact, just file + method + marker).
  if (gated > 0) {
    console.log(" Gated:");
    for (const f of findings.filter((x) => x.gated)) {
      const methods = f.methods.join("/").padEnd(8, " ");
      console.log(
        `  ✓  ${methods}  ${f.matchedMarker?.padEnd(16, " ")}  ${f.file}`,
      );
    }
    console.log("");
  }

  // Print the ungated list (prominent — these are the regressions).
  if (ungated > 0) {
    console.log(" ✗ UNGATED (regression!):");
    for (const f of findings.filter((x) => !x.gated)) {
      const methods = f.methods.join("/").padEnd(8, " ");
      console.log(`     ${methods}  (no marker)        ${f.file}`);
    }
    console.log("");
  }

  if (ungated === 0) {
    console.log(" ✓ All mutating routes are gated.");
    process.exit(0);
  } else {
    console.log(
      ` ✗ ${ungated} mutating route${ungated === 1 ? "" : "s"} lack a gating marker.`,
    );
    process.exit(1);
  }
}

main();
