import { useQuery } from '@tanstack/react-query';
import type { DeployedVersion } from '../lib/version';
import { deployedVersionQuery } from './queries';

/** The build this page was loaded from. */
export const loadedCommit = __APP_COMMIT__;

/** The build the API runs (see `deployedVersionQuery`), or null until it has answered once. */
export function useDeployedVersion(): DeployedVersion | null {
  return useQuery(deployedVersionQuery).data ?? null;
}
