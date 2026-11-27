import { says, z } from '../validation';

// Signing in: an e-mail address receives a six-digit code. Both routes answer 204, or an error; asking for a code
// on a developer's computer, with no mail service, answers the code itself.

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** An address as typed: spaces around and capitals do not matter. */
export const email = (message: string) =>
  z.string(says(message)).trim().toLowerCase().max(254, says(message)).regex(emailPattern, says(message));

export const invalidEmail = 'Adresse e-mail invalide.';
export const signInEmail = z.object({ email: email(invalidEmail) });
export type SignInEmail = z.input<typeof signInEmail>;

export const invalidCode = 'Code invalide.';
export const signInCode = z.object({
  email: email(invalidCode),
  code: z
    .string(says(invalidCode))
    .trim()
    .regex(/^\d{6}$/, says(invalidCode)),
});
export type SignInCode = z.input<typeof signInCode>;

/** A code asked for on a developer's computer, where no mail goes out: the sign-in page shows it. */
export const signInCodeShown = z.object({ devCode: z.string().regex(/^\d{6}$/) });
export type SignInCodeShown = z.output<typeof signInCodeShown>;
