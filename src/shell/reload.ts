// Recovery from a stale index.html: after a redeploy a cached index points at chunk files that
// no longer exist, so the chapter's dynamic import fails. Reload once; never loop.

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** sessionStorage key: time [ms] of the last reload triggered by a failed chapter import. */
export const RELOAD_KEY = 'wps.chunkReload';
/** A second failure within this window [ms] shows an error instead of reloading again. */
export const RELOAD_WINDOW = 60_000;

/** Reload unless one already happened within RELOAD_WINDOW; returns whether it reloaded. */
export function reloadOnce(store: Store | null, now: number, reload: () => void): boolean {
  // Without storage there is no loop guard: show the error instead.
  if (!store) return false;
  try {
    const last = Number(store.getItem(RELOAD_KEY));
    if (last > 0 && now - last >= 0 && now - last < RELOAD_WINDOW) return false;
    store.setItem(RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}

/** After a successful load: a later stale chunk (next redeploy) may reload once again. */
export function clearReloadGuard(store: Store | null): void {
  try {
    store?.removeItem(RELOAD_KEY);
  } catch {
    /* storage blocked */
  }
}

export function sessionStore(): Store | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
