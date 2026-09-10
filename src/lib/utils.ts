import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeAnswer(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/^[-:.,\s]+|[-:.,\s]+$/g, '');
}

/**
 * Generates variations from answer keys with slashes (e.g. "is / was")
 * and optional parts in parentheses (e.g. "(to) go", "have (got)").
 */
function expandAcceptedAnswer(rawAns: string): string[] {
  const norm = normalizeAnswer(rawAns);
  if (!norm) return [];

  // Split by slashes if present (e.g. "easy / simple")
  const parts = norm.split('/').map(p => normalizeAnswer(p)).filter(Boolean);
  const results = new Set<string>();

  for (const part of parts) {
    results.add(part);

    // Expand parentheses: e.g. "(to) go" -> "to go" and "go"
    if (/\(.*?\)/.test(part)) {
      const withParens = normalizeAnswer(part.replace(/[()]/g, ''));
      const withoutParens = normalizeAnswer(part.replace(/\(.*?\)/g, ''));
      if (withParens) results.add(withParens);
      if (withoutParens) results.add(withoutParens);
    }
  }

  return Array.from(results);
}

export function checkTextAnswer(
  userText: string,
  acceptedAnswers?: string[],
  givenPrefix?: string
): boolean {
  if (!userText) return false;
  const normUser = normalizeAnswer(userText);
  if (!normUser) return false;

  if (!acceptedAnswers || acceptedAnswers.length === 0) {
    return false;
  }

  // Expand all accepted answers
  const allAccepted: string[] = [];
  for (const a of acceptedAnswers) {
    allAccepted.push(...expandAcceptedAnswer(a));
  }

  const normPrefix = givenPrefix ? normalizeAnswer(givenPrefix) : '';

  for (const normAns of allAccepted) {
    if (normAns === normUser) return true;

    // Handle sentence rewrite prefixes
    if (normPrefix) {
      if (normAns.startsWith(normPrefix)) {
        const withoutPrefix = normalizeAnswer(normAns.slice(normPrefix.length));
        if (withoutPrefix === normUser) return true;
      }
      if (normUser.startsWith(normPrefix)) {
        const userWithoutPrefix = normalizeAnswer(normUser.slice(normPrefix.length));
        if (userWithoutPrefix === normAns) return true;
      }
    }
  }

  return false;
}
