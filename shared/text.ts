/** Text normalization helpers shared by the server (authoritative) and client (UX hints). */

/** Trim and collapse internal whitespace; strip control characters. */
export function cleanText(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Case-insensitive, whitespace-normalized key used for duplicate detection. */
export function compareKey(input: string): string {
  return cleanText(input).toLocaleLowerCase('en-US');
}

/**
 * A looser key used to decide whether a fib is "the truth in disguise":
 * ignores case, punctuation, and leading articles ("The Moon!" == "moon").
 */
export function looseKey(input: string): string {
  return compareKey(input)
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}
