"use client";
import { create } from "zustand";

export type View =
  | "dashboard" | "analytics" | "items" | "bom" | "production" | "shopfloor"
  | "quality" | "planning" | "trace" | "inventory" | "warehouse" | "purchase"
  | "sales" | "jobwork" | "parties" | "accounts" | "users";

interface NavState {
  view: View;
  param?: string | number; // e.g. invoice id, serial no
  go: (view: View, param?: string | number) => void;
}

export const useNav = create<NavState>((set) => ({
  view: "dashboard",
  param: undefined,
  go: (view, param) => set({ view, param }),
}));
