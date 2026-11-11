import { useSyncExternalStore } from "react";

let revision = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getRevision() {
  return revision;
}

export function emitLiveDataChanged() {
  revision += 1;
  for (const listener of listeners) listener();
}

/** Re-render data-driven screens after a remote snapshot has been applied. */
export function useLiveDataRevision(): number {
  return useSyncExternalStore(subscribe, getRevision, getRevision);
}
