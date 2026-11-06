/** Compares in constant time, so the response time never reveals how much of the key matched. */
export function secretKeyMatches(expected: unknown, provided: unknown): boolean {
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
