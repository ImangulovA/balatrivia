// Answer normalization. MUST stay byte-identical to norm() in
// scripts/build_questions.py, or typed guesses won't hash to the shipped
// accept hashes. Verified by the parity selftest in that script.

const STOPWORDS = new Set(['a', 'an', 'the']);

export function norm(s) {
  s = (s || '').normalize('NFKD').replace(/\p{M}/gu, ''); // strip accents
  s = s.toLowerCase();
  s = s.replace(/&/g, ' and ');
  s = s.replace(/\([^)]*\)/g, ' ');        // drop parentheticals
  s = s.replace(/[^a-z0-9 ]/g, ' ');       // keep only a-z 0-9 space
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/([a-z])\1+/g, '$1');      // collapse repeated LETTERS (not digits)
  const toks = s.split(' ').filter((t) => t && !STOPWORDS.has(t));
  toks.sort();
  return toks.join(' ');
}

export async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
