/** Whether the signed-in member is the one configured to import public MMR snapshots. */
export function canImportPublicMmr(settings: { MMR_UPDATER_USER_ID?: unknown }, userId: string): boolean {
  return (
    typeof settings.MMR_UPDATER_USER_ID === 'string' &&
    settings.MMR_UPDATER_USER_ID.length > 0 &&
    settings.MMR_UPDATER_USER_ID === userId
  );
}

/** Compares in constant time, so the response time never reveals how much of the key matched. */
export function publicMmrKeyMatches(expected: unknown, provided: unknown): boolean {
  if (
    typeof expected !== 'string' ||
    expected.length < 32 ||
    typeof provided !== 'string' ||
    provided.length !== expected.length
  ) {
    return false;
  }
  let different = 0;
  for (let index = 0; index < expected.length; index++)
    different |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  return different === 0;
}
