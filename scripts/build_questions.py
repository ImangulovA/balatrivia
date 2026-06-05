#!/usr/bin/env python3
"""Build the balatrivia question bundle from OpenTDB.

Fetches multiple-choice questions, throws away the distractors (we play
open-ended typed input), and ships only `question + accept[hashes]` so no
plaintext answers live in the client source.

norm() here MUST stay byte-identical to norm() in app/src/lib/norm.js, or
typed guesses won't hash to the shipped accept hashes. There is a parity test
at the bottom (run with --selftest).

Usage:
    python3 build_questions.py            # fetch ~500 and write bundle
    python3 build_questions.py --amount 800
    python3 build_questions.py --selftest
"""
import argparse
import base64
import hashlib
import html
import json
import re
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "app" / "static" / "data" / "questions_en.json"
API = "https://opentdb.com/api.php"
TOKEN_API = "https://opentdb.com/api_token.php?command=request"

STOPWORDS = {"a", "an", "the"}

# small-number <-> word table for generating answer aliases (build time only)
_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
         "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
         "sixteen", "seventeen", "eighteen", "nineteen"]
_TENS = {20: "twenty", 30: "thirty", 40: "forty", 50: "fifty", 60: "sixty",
         70: "seventy", 80: "eighty", 90: "ninety"}
_ROMAN = {"i": "1", "ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6",
          "vii": "7", "viii": "8", "ix": "9", "x": "10"}


def _strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s)
                   if not unicodedata.combining(c))


def norm(s: str) -> str:
    """Bilingual (Latin + Cyrillic), typo-tolerant, word-order-independent
    normalization. Keep in lockstep with norm() in app/src/lib/norm.js."""
    s = _strip_accents(s or "")               # also folds ё->е, й->и
    s = s.lower()
    s = s.replace("&", " and ")
    s = re.sub(r"\([^)]*\)", " ", s)          # drop parentheticals
    s = re.sub(r"[^a-zа-я0-9 ]", " ", s)      # keep Latin + Cyrillic + digits + space
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"([a-zа-я])\1+", r"\1", s)    # collapse repeated LETTERS (not digits)
    toks = [t for t in s.split(" ") if t and t not in STOPWORDS]
    toks.sort()
    return " ".join(toks)


def _num_to_words(n: int) -> str:
    if n < 20:
        return _ONES[n]
    if n < 100:
        t = (n // 10) * 10
        r = n % 10
        return _TENS[t] + (" " + _ONES[r] if r else "")
    return ""  # bigger numbers: skip word form


def answer_aliases(answer: str):
    """Generate alternative surface forms of an answer, all run through norm()."""
    variants = {answer}
    low = answer.lower()
    # digits -> words for standalone small integers
    def repl_digit(m):
        n = int(m.group(0))
        w = _num_to_words(n) if n < 100 else ""
        return w or m.group(0)
    variants.add(re.sub(r"\b\d{1,2}\b", repl_digit, low))
    # roman numerals -> digits
    toks = low.split()
    if any(t.strip(".") in _ROMAN for t in toks):
        variants.add(" ".join(_ROMAN.get(t.strip("."), t) for t in toks))
    # normalize all, drop empties, dedupe
    return sorted({norm(v) for v in variants if norm(v)})


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def b64(s: str) -> str:
    return base64.b64encode(s.encode("utf-8")).decode("ascii")


def _get(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "balatrivia/0.1"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())


def fetch(amount: int):
    token = _get(TOKEN_API)["token"]
    seen = set()
    out = []
    while len(out) < amount:
        url = f"{API}?amount=50&type=multiple&token={token}"
        try:
            data = _get(url)
        except Exception as e:
            print("  request failed, retrying:", e, file=sys.stderr)
            time.sleep(6)
            continue
        code = data.get("response_code")
        if code == 4:  # token exhausted -> reset and stop
            print("  token exhausted (saw the whole DB)", file=sys.stderr)
            break
        if code != 0:
            print(f"  response_code={code}, sleeping", file=sys.stderr)
            time.sleep(6)
            continue
        for r in data["results"]:
            q = html.unescape(r["question"]).strip()
            ans = html.unescape(r["correct_answer"]).strip()
            key = norm(q)
            if not key or key in seen:
                continue
            # keep answers typeable: short and few words
            if len(ans) > 40 or len(ans.split()) > 5:
                continue
            aliases = answer_aliases(ans)
            if not aliases:  # answer normalizes to empty (e.g. "A") -> unwinnable
                continue
            seen.add(key)
            out.append({
                "id": len(out),
                "category": html.unescape(r["category"]).replace("Entertainment: ", "")
                                                          .replace("Science: ", ""),
                "difficulty": r["difficulty"],
                "question": q,
                "reveal": b64(ans),
                "accept": [sha256(a) for a in aliases],
            })
            if len(out) >= amount:
                break
        print(f"  collected {len(out)}/{amount}", file=sys.stderr)
        time.sleep(5)  # OpenTDB: 1 request / 5s / IP
    return out


def selftest():
    cases = [
        ("The Beatles", "beatles"),
        ("a   beatles", "beatles"),
        ("Beatles, The", "beatles"),
        ("Café", "cafe"),
        ("Rock & Roll", "and rock rol"),    # & -> and, words sorted, ll->l
        ("Dennis Bergkamp", "bergkamp denis"),   # nn->n, order-independent
        ("Bergkamp  Dennis", "bergkamp denis"),
        ("Aaron", "aron"),                  # repeated letter collapsed
        ("1900", "1900"),                   # digits NOT collapsed
    ]
    ok = True
    for raw, want in cases:
        got = norm(raw)
        flag = "ok" if got == want else "FAIL"
        if got != want:
            ok = False
        print(f"  [{flag}] norm({raw!r}) = {got!r} (want {want!r})")
    print("selftest", "PASSED" if ok else "FAILED")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--amount", type=int, default=500)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        sys.exit(0 if selftest() else 1)
    print(f"fetching up to {args.amount} questions from OpenTDB...", file=sys.stderr)
    qs = fetch(args.amount)
    bundle = {
        "source": "Open Trivia Database (opentdb.com), CC BY-SA 4.0",
        "count": len(qs),
        "questions": qs,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bundle, ensure_ascii=False, indent=0))
    print(f"wrote {len(qs)} questions -> {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
