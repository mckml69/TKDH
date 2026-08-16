/**
 * Zero-backend storage adapter, backed by the browser's own localStorage.
 *
 * Use this to run and click through the whole app with no server or database at all —
 * useful for local development and for demoing the UI. Data lives only in this one
 * browser and is NOT shared between devices or team members, which defeats the actual
 * point of a shared compliance log, so this is a development convenience only.
 *
 * Implements the same three-method contract (get/set/delete) plus list() that every
 * hook in the app already calls via `window.storage`, so nothing else needs to change
 * to use this — see src/lib/storage/index.js for how the adapter is selected.
 */
const PREFIX = "compliance-ledger:";

function keyFor(key, shared) {
  return `${PREFIX}${shared ? "shared" : "personal"}:${key}`;
}

export const localAdapter = {
  async get(key, shared) {
    const raw = localStorage.getItem(keyFor(key, shared));
    if (raw === null) throw new Error(`not found: ${key}`);
    return { key, value: raw, shared };
  },
  async set(key, value, shared) {
    localStorage.setItem(keyFor(key, shared), value);
    return { key, value, shared };
  },
  async delete(key, shared) {
    localStorage.removeItem(keyFor(key, shared));
    return { key, deleted: true, shared };
  },
  async list(prefix, shared) {
    const scopePrefix = `${PREFIX}${shared ? "shared" : "personal"}:`;
    const scope = scopePrefix + (prefix || "");
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(scope)) keys.push(k.slice(scopePrefix.length));
    }
    return { keys, prefix, shared };
  },
};
