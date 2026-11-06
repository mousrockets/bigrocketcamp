import { useEffect, useState } from 'react';
import { fetchWithin } from '../lib/timeout';
import type { DeployedVersion } from '../lib/version';

/** The build this page was loaded from. */
export const loadedCommit = __APP_COMMIT__;

const checkEvery = 5 * 60_000;

/** The build the API runs: checked on load, every five minutes while the page is visible, and on each return to it. */
export function useDeployedVersion(): DeployedVersion | null {
  const [deployed, setDeployed] = useState<DeployedVersion | null>(null);
  useEffect(() => {
    let stopped = false;
    async function check() {
      if (document.hidden) return;
      try {
        const response = await fetchWithin(fetch, '/api/health', { cache: 'no-store' });
        if (!response.ok) return;
        const body = (await response.json()) as Partial<DeployedVersion>;
        // An API older than this check names no commit: nothing to compare.
        if (stopped || typeof body.commit !== 'string') return;
        const next = { commit: body.commit, deployedAt: body.deployedAt ?? null };
        setDeployed((current) =>
          current?.commit === next.commit && current.deployedAt === next.deployedAt ? current : next,
        );
      } catch {
        // Offline: the next check tries again.
      }
    }
    check();
    const timer = setInterval(check, checkEvery);
    document.addEventListener('visibilitychange', check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return deployed;
}
