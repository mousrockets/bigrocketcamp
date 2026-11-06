/** What /api/health says about the build that answers. */
export interface DeployedVersion {
  commit: string;
  deployedAt: string | null;
}

/** Cloudflare dates a version to the microsecond; every browser reads the millisecond form. */
export function isoDate(timestamp: string): string | null {
  const time = Date.parse(timestamp);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** "Version a1b2c3d · Déployée le 6 nov. 2026 à 21 h 04", in Paris time; a local build is just "Version dev". */
export function versionLabel(version: DeployedVersion): string {
  const deployedAt = new Date(version.deployedAt ?? Number.NaN);
  if (version.commit === 'dev' || Number.isNaN(deployedAt.getTime())) return `Version ${version.commit}`;
  const date = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(deployedAt);
  const time = Object.fromEntries(
    new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(deployedAt)
      .map((part) => [part.type, part.value]),
  );
  return `Version ${version.commit} · Déployée le ${date} à ${time.hour} h ${time.minute}`;
}
