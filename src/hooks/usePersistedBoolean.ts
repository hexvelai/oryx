import { useCallback, useState } from "react";

function readStorage(key: string, fallback: boolean) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function usePersistedBoolean(storageKey: string, defaultValue: boolean) {
  const [value, setValue] = useState(() => readStorage(storageKey, defaultValue));

  const set = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: boolean) => boolean)(prev) : next;
        try {
          localStorage.setItem(storageKey, resolved ? "1" : "0");
        } catch {
          /* ignore */
        }
        return resolved;
      });
    },
    [storageKey],
  );

  return [value, set] as const;
}
