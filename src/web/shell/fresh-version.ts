import { useEffect } from 'react';
import { loadedCommit, useDeployedVersion } from '../version';

// The app and the API are deployed apart: when the API runs a newer build, the page reloads to it, at a moment
// the member will not notice.

/** How long a visible page must stay untouched before it reloads. */
const idleBeforeReload = 30_000;
/** An installed app can stay open for days: after a pause this long, it reloads on return. */
const longPause = 5 * 60_000;

const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * Reloads to the deployed build once the page is hidden, or untouched for 30 s (typing, scrolling or tapping counts
 * as activity). `held` keeps the page as it is, while a write is under way.
 */
export function useFreshVersion(held = false): void {
  const deployed = useDeployedVersion();
  const outdated = deployed !== null && deployed.commit !== loadedCommit;

  useEffect(() => {
    if (!outdated || held) return;
    let timer = 0;
    const reloadWhenIdle = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => location.reload(), document.hidden ? 0 : idleBeforeReload);
    };
    const activity = ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart'] as const;
    for (const event of activity) window.addEventListener(event, reloadWhenIdle, { passive: true });
    document.addEventListener('visibilitychange', reloadWhenIdle);
    reloadWhenIdle();
    return () => {
      clearTimeout(timer);
      for (const event of activity) window.removeEventListener(event, reloadWhenIdle);
      document.removeEventListener('visibilitychange', reloadWhenIdle);
    };
  }, [outdated, held]);

  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (!held && isStandalone() && hiddenAt && Date.now() - hiddenAt > longPause) location.reload();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [held]);
}
