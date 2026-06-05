#!/usr/bin/env python3
"""Build the Russian (ЧГК) question bundle from local tournament pack JSONs.

Source: ~/Downloads/Quiz Packs/packs/*.json  (one tournament per file, named
<id>.json). Each pack has tours -> questions with open-ended answers, a `zachet`
(accepted alternatives) field, and a rich `comment`. We take the most recent N
packs (highest ids) and keep only short, typeable, media-free questions.

Output schema matches the English bundle plus `lang` and optional `comment`:
    { id, lang, category, difficulty, question, reveal(b64), comment(b64|''), accept[hashes] }

norm()/sha256/b64 are imported from build_questions.py so normalization stays
byte-identical across both languages (and with app/src/lib/norm.js).

Usage:
    python3 build_questions_ru.py            # last 400 packs
    python3 build_questions_ru.py --packs 400
"""
import argparse
import json
import re
import sys
from pathlib import Path

from build_questions import norm, sha256, b64  # single source of truth for norm

SRC = Path.home() / "Downloads" / "Quiz Packs" / "packs"
OUT = Path(__file__).resolve().parent.parent / "app" / "static" / "data" / "questions_ru.json"

MAX_ANSWER_CHARS = 60
MAX_ANSWER_TOKENS = 5
MAX_QUESTION_CHARS = 650
MAX_COMMENT_CHARS = 280

# separators that split a zachet/answer field into independent acceptable variants
SPLIT_RE = re.compile(r"\s*(?:;|/|\bили\b|\bлибо\b|\n)\s*", re.IGNORECASE)
THANKS_RE = re.compile(r"(благодар|тестир)", re.IGNORECASE)
LABEL_RE = re.compile(r"^\s*(зач[её]т|незач[её]т|точный ответ)\s*[:\-]?\s*", re.IGNORECASE)


def clean_text(text, razdatka):
    """Drop author-thanks preamble lines; prepend handout text if present."""
    lines = [ln.strip() for ln in (text or "").split("\n")]
    # drop leading thanks/credits lines
    while lines and THANKS_RE.search(lines[0]) and len(lines) > 1:
        lines.pop(0)
    body = " ".join(ln for ln in lines if ln).strip()
    razdatka = (razdatka or "").strip()
    if razdatka:
        body = f"[Раздаточный материал: {razdatka}] {body}"
    return body.strip()


def variants(answer, zachet):
    """All acceptable surface forms from answer + zachet, each later norm'd.
    ЧГК uses [...] for optional answer parts, so emit a form with bracketed
    parts kept AND a form with them removed (so the short answer also matches)."""
    out = []
    for field in (answer, zachet):
        if not field:
            continue
        field = LABEL_RE.sub("", field.strip())
        for chunk in SPLIT_RE.split(field):
            chunk = chunk.strip().strip("«»\"'.,")
            if not chunk:
                continue
            out.append(chunk)
            stripped = re.sub(r"\[[^\]]*\]", " ", chunk).strip()  # optional parts removed
            if stripped and stripped != chunk:
                out.append(stripped)
    return out


def accept_hashes(answer, zachet):
    seen, hashes = set(), []
    for v in variants(answer, zachet):
        n = norm(v)
        if not n or n in seen:
            continue
        # keep only typeable variants (short)
        if len(n.split()) > MAX_ANSWER_TOKENS:
            continue
        seen.add(n)
        hashes.append(sha256(n))
    return hashes


def pack_ids(n):
    ids = []
    for f in SRC.glob("*.json"):
        if f.stem.isdigit():
            ids.append(int(f.stem))
    ids.sort(reverse=True)  # most recent first
    return ids[:n]


def build(n_packs):
    if not SRC.is_dir():
        print(f"source not found: {SRC}", file=sys.stderr)
        sys.exit(1)
    ids = pack_ids(n_packs)
    print(f"using {len(ids)} most-recent packs (ids {ids[-1]}..{ids[0]})", file=sys.stderr)
    out, seen = [], set()
    for pid in ids:
        try:
            data = json.loads((SRC / f"{pid}.json").read_text())
        except Exception as e:
            print(f"  skip pack {pid}: {e}", file=sys.stderr)
            continue
        for tour in data.get("tours", []):
            for q in tour.get("questions", []):
                # skip anything that needs media we can't render
                if any(q.get(k) for k in ("razdatkaPic", "answerPic", "audio", "commentAudio")):
                    continue
                ans = (q.get("answer") or "").strip()
                if not ans or len(ans) > MAX_ANSWER_CHARS:
                    continue
                accept = accept_hashes(ans, q.get("zachet") or "")
                if not accept:
                    continue
                # main answer must itself be typeable
                if len(norm(ans).split()) > MAX_ANSWER_TOKENS:
                    continue
                text = clean_text(q.get("text"), q.get("razdatkaText"))
                if not text or len(text) > MAX_QUESTION_CHARS:
                    continue
                key = norm(text)
                if not key or key in seen:
                    continue
                seen.add(key)
                comment = (q.get("comment") or "").strip()
                if len(comment) > MAX_COMMENT_CHARS:
                    comment = comment[:MAX_COMMENT_CHARS].rstrip() + "…"
                out.append({
                    "id": len(out),
                    "lang": "ru",
                    "category": "ЧГК",
                    "difficulty": "medium",
                    "question": text,
                    "reveal": b64(ans),
                    "comment": b64(comment),
                    "accept": accept,
                })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--packs", type=int, default=400)
    args = ap.parse_args()
    qs = build(args.packs)
    bundle = {
        "source": "ЧГК tournament packs (gotvquiz / rating.chgk.info)",
        "lang": "ru",
        "count": len(qs),
        "questions": qs,
    }
    OUT.write_text(json.dumps(bundle, ensure_ascii=False, indent=0))
    print(f"wrote {len(qs)} questions -> {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
