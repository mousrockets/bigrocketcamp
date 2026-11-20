// A device subscribed to the daily reminder is named by a SHA-256 of its push endpoint: the API lists the member's
// devices by these names, and a device computes its own to know whether it is among them. The endpoint itself never
// travels back.

export async function reminderDeviceIdOf(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
