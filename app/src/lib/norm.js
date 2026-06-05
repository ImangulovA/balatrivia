// Answer normalization. Bilingual (Latin + Cyrillic). MUST stay byte-identical
// to norm() in scripts/build_questions.py (and build_questions_ru.py), or typed
// guesses won't hash to the shipped accept hashes. Verified by parity selftests.
//
// NFKD + combining-mark strip folds accents AND Cyrillic e/short-i:
//   cafe<-cafe(accent), ёлка->елка, Йод->иод (consistent in Python & JS).

const STOPWORDS = new Set(['a', 'an', 'the']);

export function norm(s) {
  s = (s || '').normalize('NFKD').replace(/\p{M}/gu, ''); // strip accents + fold ё/й
  s = s.toLowerCase();
  s = s.replace(/&/g, ' and ');
  s = s.replace(/\([^)]*\)/g, ' ');         // drop parentheticals
  s = s.replace(/[^a-zа-я0-9 ]/g, ' ');     // keep Latin + Cyrillic + digits + space
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/([a-zа-я])\1+/g, '$1');    // collapse repeated LETTERS (not digits)
  const toks = s.split(' ').filter((t) => t && !STOPWORDS.has(t));
  toks.sort();
  return toks.join(' ');
}

export async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
