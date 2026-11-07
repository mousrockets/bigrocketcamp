import { says, z } from '../validation';
import type { Known } from './shared';

// The Windows collector pairs with a code shown on the member's profile, then sends matches with its own token.

const codeAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const invalidPairingCode = 'Le code d’association fait 8 caractères.';
/** The pairing code as typed: case, spaces and dashes do not matter. */
export const pairingCode = z.object({
  code: z
    .string(says(invalidPairingCode))
    .transform((code) => code.toUpperCase().replace(/[\s-]/g, ''))
    .pipe(
      z
        .string()
        .length(8, says(invalidPairingCode))
        .refine((code) => [...code].every((char) => codeAlphabet.includes(char)), says(invalidPairingCode)),
    ),
});
export type PairingCodeInput = z.input<typeof pairingCode>;

export const unknownCollector = 'Collecteur inconnu.';
export const collectorToRevoke = z.object({ id: z.string(says(unknownCollector)) });
export type CollectorToRevoke = z.input<typeof collectorToRevoke>;

/** What the collector receives for its code, once. */
export const collectorPairing = z.looseObject({ token: z.string(), player: z.string() });
export type CollectorPairing = Known<z.output<typeof collectorPairing>>;

/** The player a collector sends matches for: empty until its member chooses a duo pseudo. */
export const collectorStatus = z.looseObject({ player: z.string() });
export type CollectorStatus = Known<z.output<typeof collectorStatus>>;

/** A code the member types in the collector; a new one replaces the previous one. */
export const pairingCodeCreated = z.looseObject({ code: z.string(), expires: z.string() });
export type PairingCodeCreated = Known<z.output<typeof pairingCodeCreated>>;

export const collectorDevice = z.looseObject({ id: z.string(), created: z.string(), lastSeen: z.string().nullable() });
export type CollectorDevice = Known<z.output<typeof collectorDevice>>;

export const collectorDevices = z.looseObject({ devices: z.array(collectorDevice) });
export type CollectorDevices = Known<z.output<typeof collectorDevices>>;
