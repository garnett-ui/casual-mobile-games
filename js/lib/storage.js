// Tiny namespaced JSON store on localStorage. Falls back to memory when
// storage is unavailable (private browsing, blocked site data).
const PREFIX = 'pocket-arcade:';
const memory = new Map();

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw != null) return JSON.parse(raw);
  } catch {
    if (memory.has(key)) return memory.get(key);
  }
  return fallback;
}

export function save(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Memory copy above keeps the session working.
  }
}
