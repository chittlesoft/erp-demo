// Client-safe role types + helpers shared by the UI + the NextAuth config.
// No imports from server-only modules (no Prisma, no NextAuth) so this file can
// be imported from both "use client" components and the NextAuth route handler.

export type Role = "admin" | "operator" | "viewer";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  operator: "Shop operator",
  viewer: "Viewer",
};

/** admin + operator can create / update / delete / dispatch. viewer is read-only. */
export function canEdit(role: Role | string | undefined | null): boolean {
  return role === "admin" || role === "operator";
}

/** admin-only actions: reseed demo data, manage users, edit company settings. */
export function isAdmin(role: Role | string | undefined | null): boolean {
  return role === "admin";
}

/** Coerce an unknown role string from the JWT / session into our Role union. */
export function asRole(role: unknown): Role {
  if (role === "admin" || role === "operator" || role === "viewer") return role;
  return "viewer";
}
