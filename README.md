# Balatrivia

Roguelike trivia in the spirit of [Balatro](https://www.playbalatro.com/). Open-ended
questions are served one at a time; over a run you clear escalating rounds by reaching
a target score, and between rounds you build a deck of **jokers** in a shop. English.

Play: https://imangulova.github.io/balatrivia/

## How it works

- **8 rounds.** Each round serves a few questions; hit the **target score** within your
  **lives** to advance. Lose a round and the run is over (roguelike permadeath).
- **One attempt per question** (jokers can override this).
- **Bets** before each answer: **Safe** (+1), **Double** (+2, costs a life on a miss),
  **All-in** (+3 and +$3, but a miss ends the round).
- **Shop between rounds:** buy jokers (hard cap **5 slots**), reroll the offer, sell to
  rebuild. Prices scale by rarity ($4 / $6 / $8 / $10). Banked money earns interest.

## Tech

- SvelteKit + `adapter-static`, deployed to GitHub Pages. Fully client-side.
- Questions: a static JSON bundle built from the **Open Trivia Database** (CC BY-SA 4.0).
  Only `question + accept[hashes]` ship -- no plaintext answers in the source.

## Dev

```bash
cd app
npm install
npm run dev
```

## Languages

Two question pools, chosen on the menu and loaded on demand (neither ships to the
other's players; both are static JSON under `app/static/data/`, fetched at runtime):

- **English** — Open Trivia Database (CC BY-SA 4.0).
- **Русский (ЧГК)** — open-ended What? Where? When? tournament questions, with the
  classic rich answer comments shown on reveal.

## Rebuild the question bundles

```bash
python3 scripts/build_questions.py --selftest    # verify norm() parity
python3 scripts/build_questions.py --amount 6000 # EN -> app/static/data/questions_en.json
python3 scripts/build_questions_ru.py --packs 400 # RU -> app/static/data/questions_ru.json
```

The RU script reads tournament packs from `~/Downloads/Quiz Packs/packs/*.json`
(newest N by id) and imports `norm()` from the EN script so normalization stays
identical across both languages.

The Python `norm()` and the JS `norm()` (`app/src/lib/norm.js`) must stay byte-identical
or typed guesses won't match the shipped accept hashes.

## Attribution

- English questions: [Open Trivia Database](https://opentdb.com/), licensed
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- Russian questions: What? Where? When? (ЧГК) tournament packs via
  [rating.chgk.info](https://rating.chgk.info/) / gotvquiz; questions belong to
  their respective authors and editors.
