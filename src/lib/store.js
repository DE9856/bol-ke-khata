// Saves the ledger in the browser (localStorage). Everything still works if storage is blocked;
// the ledger then lasts only until the page reloads.

import { seedState } from "./seed.js";

const KEY = "bolkekhata.v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 1 && Array.isArray(s.entries)) return s;
    }
  } catch { /* private mode or blocked storage */ }
  return seedState();
}

export function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function resetState() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return seedState();
}
