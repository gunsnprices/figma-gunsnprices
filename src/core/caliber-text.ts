// "Normalize caliber text": rewrite caliber spellings ("9MM LUGER", "5.56 NATO", "12ga", ".357/.38 Spl") as standard
// names, using the gunsnprices parser. Text that is more than a caliber (a product title, a sentence) is left alone.
import { findCalibers, normalizeCaliber } from 'gunsnprices';
import { CALIBER_WORDS } from './catalog';

export type CaliberTextResult =
  | { status: 'changed'; text: string }
  | { status: 'standard' } // already the standard name
  | { status: 'not-caliber' }; // not a caliber, or more than one

const SEPARATOR = /(\s*(?:\/|,|;|\||&|\bor\b|\band\b)\s*)/i;
const LABEL = /^([A-Za-z][A-Za-z ]{0,24}:\s*)([\s\S]+)$/;

function word(w: string): string {
  return w.toLowerCase().replace(/^[^a-z0-9+]+|[^a-z0-9+]+$/g, '');
}

/** every word of the text is part of a caliber spelling ("9mm Luger", "22LR" yes; "Glock 19 9mm" no) */
function onlyCaliberWords(text: string): boolean {
  const words = text.split(/[\s,;|()]+/).map(word).filter(Boolean);
  return words.length > 0 && words.every((w) => CALIBER_WORDS.has(w) || PLUS_P.test(w) || findCalibers(w).length > 0);
}

const PLUS_P = /^\+p\+?$/;

/** the standard name when the text is one caliber and nothing else; a +P or +P+ load mark is kept */
function single(text: string): string | null {
  const t = text.trim();
  if (!t || !onlyCaliberWords(t) || findCalibers(t).length > 1) return null;
  const name = normalizeCaliber(t)?.name;
  if (!name) return null;
  const plus = /\+\s?p(\+?)(?![a-z])/i.exec(t);
  return plus ? `${name} +P${plus[1]}` : name;
}

function value(text: string): string | null {
  const one = single(text);
  if (one) return one;
  // ".357 Mag / .38 Spl", "5.56 NATO, .223 Rem": each part on its own, separators kept
  const parts = text.split(SEPARATOR);
  if (parts.length < 3) return null;
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2) {
      out.push(parts[i]);
      continue;
    }
    const name = single(parts[i]);
    if (!name) return null;
    out.push(name);
  }
  return out.join('');
}

export function normalizeCaliberText(text: string): CaliberTextResult {
  const lead = /^\s*/.exec(text)![0];
  const trail = /\s*$/.exec(text)![0];
  const body = text.trim();
  // "Caliber: 9mm" keeps its label
  const m = LABEL.exec(body);
  const labelled = m && value(m[2]);
  const result = m && labelled ? m[1] + labelled : value(body);
  if (result === null) return { status: 'not-caliber' };
  const full = lead + result + trail;
  return full === text ? { status: 'standard' } : { status: 'changed', text: full };
}
