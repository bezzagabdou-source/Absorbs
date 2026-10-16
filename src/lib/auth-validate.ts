/** Shared validation for local account endpoints. */

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export function validEmail(email: string): boolean {
  return typeof email === "string" && email.length >= 6 && email.length <= 254 && EMAIL_RE.test(email.trim());
}

export function validName(name: string): boolean {
  return typeof name === "string" && name.trim().length >= 2 && name.trim().length <= 80;
}

export function validPhone(phone: string | null | undefined): boolean {
  if (phone === null || phone === undefined || phone === "") return true;
  return typeof phone === "string" && /^\+?[0-9][0-9\s\-()]{6,18}$/.test(phone.trim());
}

export function validCountry(c: string | null | undefined): boolean {
  if (c === null || c === undefined || c === "") return true;
  return typeof c === "string" && c.trim().length >= 2 && c.trim().length <= 64;
}

export interface SignupInput {
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  termsAt: Date;
  uid: string;
}
