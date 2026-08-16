import { localAdapter } from "./localAdapter";
import { apiAdapter } from "./apiAdapter";

/**
 * Every hook in this app (useLedger, useUsers, useAudit, useResponsiblePerson,
 * useCurrentUser) calls `window.storage.get/set/delete/list` directly — that was the
 * interface provided for free inside the Claude.ai artifact sandbox this app was
 * originally prototyped in. Outside that sandbox nothing provides `window.storage`,
 * so this module polyfills it before the app renders.
 *
 * Set VITE_STORAGE_MODE=api in .env to point at the reference backend in /server
 * (real multi-user persistence). Leave it unset / set to "local" to run with no
 * backend at all, storing everything in this browser's localStorage — good for a
 * first look at the UI, not for real use.
 */
const mode = import.meta.env.VITE_STORAGE_MODE || "local";

/** "local" | "api" — exported so components can branch (e.g. real sign-in only makes
    sense in "api" mode, where there's an actual server to protect) without each one
    re-reading import.meta.env directly. */
export const storageMode = mode;

export function installStorageAdapter() {
  if (typeof window === "undefined") return;
  if (window.storage) return; // already provided by a host environment — don't override it
  window.storage = mode === "api" ? apiAdapter : localAdapter;
  if (mode !== "api") {
    // eslint-disable-next-line no-console
    console.info(
      "[compliance-ledger] Running with the localStorage adapter — data stays in this browser only. " +
      "Set VITE_STORAGE_MODE=api in .env and start the reference server in /server for real shared persistence."
    );
  }
}
