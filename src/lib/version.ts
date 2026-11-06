/** What /api/health says about the build that answers. */
export interface DeployedVersion {
  commit: string;
  deployedAt: string | null;
}

/** "Version a1b2c3d · déployée le 06/11 à 21 h 04", in Paris time; a local build is just "Version dev". */
export function versionLabel(version: DeployedVersion): string {
  if (version.commit === 'dev' || !version.deployedAt) return `Version ${version.commit}`;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(version.deployedAt))
      .map((part) => [part.type, part.value]),
  );
  return `Version ${version.commit} · déployée le ${parts.day}/${parts.month} à ${parts.hour} h ${parts.minute}`;
}
