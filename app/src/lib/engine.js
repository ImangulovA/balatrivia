// Run / round / economy engine for Balatrivia. Pure logic, no UI.
import { base } from '$app/paths';
import { JOKERS, PRICE, sellValue } from './jokers.js';

// Question pools are large static JSON, loaded on demand per language so the EN
// set never ships to RU players and vice versa. Neither is bundled into JS.
let POOL = [];
const _cache = {};
export const LANGS = { en: 'English', ru: 'Русский (ЧГК)' };

export async function loadPool(lang) {
  if (!_cache[lang]) {
    const res = await fetch(`${base}/data/questions_${lang}.json`);
    if (!res.ok) throw new Error(`failed to load ${lang} questions`);
    _cache[lang] = (await res.json()).questions;
  }
  POOL = _cache[lang];
  return POOL.length;
}

export const MAX_JOKERS = 5; // hard cap on joker slots
export const STARTING_MONEY = 4;

// Bet definitions. One attempt per question is the base rule (jokers may override).
export const BETS = {
  safe: { id: 'safe', label: 'Safe', points: 1, money: 0, lifeOnLoss: 0, endsRoundOnLoss: false,
          blurb: '+1 on a win. No penalty on a miss.' },
  double: { id: 'double', label: 'Double', points: 2, money: 0, lifeOnLoss: -1, endsRoundOnLoss: false,
            blurb: '+2 on a win. Lose a life on a miss.' },
  allin: { id: 'allin', label: 'All-in', points: 3, money: 3, lifeOnLoss: -1, endsRoundOnLoss: true,
           blurb: '+3 and +$3 on a win. A miss ends the round.' }
};

// 8 rounds, ALWAYS 5 questions each. "Productive-gap" curve: targets climb and
// lives TIGHTEN late so a passive all-Safe build falls behind by mid-run, while
// a player who bets aggressively + owns compounding jokers stays viable.
// `mod` attaches a Boss-Blind-style round modifier (see MODIFIERS).
export const QUESTIONS_PER_ROUND = 5;
export const ROUNDS = [
  { target: 2, lives: 3, questions: 5, hardBias: 0.10 },
  { target: 3, lives: 3, questions: 5, hardBias: 0.20 },
  { target: 4, lives: 3, questions: 5, hardBias: 0.30, mod: 'recession' },
  { target: 5, lives: 2, questions: 5, hardBias: 0.40, mod: 'the_wall' },        // boss 1
  { target: 6, lives: 2, questions: 5, hardBias: 0.50 },
  { target: 6, lives: 2, questions: 5, hardBias: 0.60, mod: 'double_jeopardy' },
  { target: 7, lives: 2, questions: 5, hardBias: 0.70, mod: 'dry_spell' },
  { target: 8, lives: 2, questions: 5, hardBias: 0.85, mod: 'sudden_death' }      // boss 2 (final)
];

// Boss / round modifiers (Balatro Boss-Blind analog). All are RU-compatible
// (no category/difficulty dependence). Modifier hooks fire BEFORE joker hooks so
// insurance jokers (Cold Blood, etc.) can still counter them.
export const MODIFIERS = {
  recession: {
    id: 'recession', name: 'Recession', desc: 'Lose $3 at the start of this round.',
    hooks: { onRoundStart: (ctx) => { ctx.money -= 3; } }
  },
  the_wall: {
    id: 'the_wall', name: 'The Wall', desc: 'Safe bets are disabled this round.',
    lockBets: ['safe']
  },
  double_jeopardy: {
    id: 'double_jeopardy', name: 'Double Jeopardy', desc: 'A penalized miss costs 2 lives.',
    hooks: { onWrong: (ctx) => { if (ctx.life < 0) ctx.life *= 2; } }
  },
  dry_spell: {
    id: 'dry_spell', name: 'Dry Spell', desc: 'No points once you are already at target (no overfill).',
    hooks: { onCorrect: (ctx) => { if (ctx.cfg && ctx.roundPoints >= ctx.cfg.target) ctx.points = 0; } }
  },
  sudden_death: {
    id: 'sudden_death', name: 'Sudden Death', desc: 'All-in only. Any miss ends the round.',
    lockBets: ['safe', 'double']
  }
};

// Economy curves (index by run.roundIdx = the round being cleared).
const BASE_BY_ROUND = [4, 4, 5, 5, 6, 6, 7, 8]; // round-clear base income
const INTEREST_CAP = [5, 5, 5, 4, 4, 3, 2, 2];  // hoarding stops paying late
const UPKEEP_RATE = [0, 0, 0, 0, 1, 1, 2, 3];   // $ per owned joker, charged at shop entry
export const REROLL_BASE = 5;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const byDiff = (d) => POOL.filter((q) => q.difficulty === d);

// Build a fresh run state object.
export function newRun(lang = 'en') {
  return {
    roundIdx: 0,
    lang,
    money: STARTING_MONEY,
    jokers: [], // joker instances (max MAX_JOKERS), each may carry .state
    seenIds: new Set(), // questions used this run, avoid repeats
    streak: 0,
    roundFlags: {},
    rerollCount: 0
  };
}

// Pick the questions for the current round, biased toward hard in later rounds.
export function dealRound(run) {
  const cfg = ROUNDS[run.roundIdx];
  const fresh = (pool) => shuffle(pool.filter((q) => !run.seenIds.has(q.id)));
  const easyMed = fresh([...byDiff('easy'), ...byDiff('medium')]);
  const hard = fresh(byDiff('hard'));
  const out = [];
  for (let k = 0; k < cfg.questions; k++) {
    const wantHard = Math.random() < cfg.hardBias && hard.length > 0;
    const src = wantHard ? hard : easyMed;
    const q = src.pop() || hard.pop() || easyMed.pop();
    if (q) {
      out.push(q);
      run.seenIds.add(q.id);
    }
  }
  return out;
}

// The modifier active this round (or null).
export function activeMod(run) {
  const id = ROUNDS[run.roundIdx]?.mod;
  return id ? MODIFIERS[id] : null;
}

// Fire a named hook across the active modifier THEN every joker (passing the
// joker instance so it can read/grow its .state). Jammed jokers are skipped.
function dispatch(run, name, ctx) {
  const mod = activeMod(run);
  if (mod && mod.hooks && mod.hooks[name]) mod.hooks[name](ctx, mod);
  for (const j of run.jokers) {
    if (run.roundFlags.jammedIds && run.roundFlags.jammedIds.includes(j.id)) continue;
    const fn = j.hooks && j.hooks[name];
    if (fn) fn(ctx, j);
  }
  return ctx;
}

// Resolve a single answered question. Mutates `run` (streak) and returns the
// effects to apply at the round level. roundPoints = score BEFORE this question.
export function resolve(run, question, bet, correct, roundPoints, cfg) {
  const ctx = {
    run, question, bet, correct, cfg, roundPoints,
    points: 0, money: 0, life: 0, endRound: false
  };

  if (correct) {
    ctx.points = bet.points;
    ctx.money = bet.money;
  } else {
    ctx.life = bet.lifeOnLoss;
    ctx.endRound = bet.endsRoundOnLoss;
  }

  dispatch(run, correct ? 'onCorrect' : 'onWrong', ctx);

  if (correct) run.streak += 1;
  else run.streak = 0;

  return ctx;
}

// Fire a lifecycle hook (onRoundStart / onRoundEnd). `extra` seeds ctx fields
// (e.g. cleared, livesLeft). Returns ctx with accumulated points/money/life.
export function fireRound(run, name, extra = {}) {
  const ctx = { run, points: 0, money: 0, life: 0, ...extra };
  dispatch(run, name, ctx);
  return ctx;
}

// Money awarded for clearing a round.
export function roundReward(run, livesLeft, points, target) {
  const idx = run.roundIdx;
  const base = BASE_BY_ROUND[idx];
  const lifeBonus = livesLeft; // $1 per surviving life
  const dry = ROUNDS[idx].mod === 'dry_spell';
  const overfill = dry ? 0 : Math.max(0, points - target);
  const interest = Math.min(INTEREST_CAP[idx], Math.floor(run.money / 5));
  return { base, lifeBonus, overfill, interest, total: base + lifeBonus + overfill + interest };
}

// Operating Cost: charged at shop entry from mid-run on; scales with board size.
export function upkeepCost(run) {
  return UPKEEP_RATE[run.roundIdx] * run.jokers.length;
}

// Round-indexed price inflation: early decisive buys are cheaper than late fishing.
export function jokerPrice(run, j) {
  return Math.ceil(PRICE[j.rarity] * (1 + 0.10 * run.roundIdx));
}

// Build a shop offer of up to `n` jokers the player does not already own.
// In RU mode, hide jokers that depend on category/difficulty (ruCompatible === false).
export function rollShop(run, n = 3) {
  const owned = new Set(run.jokers.map((j) => j.id));
  const pool = shuffle(
    JOKERS.filter((j) => !owned.has(j.id) && !(run.lang === 'ru' && j.ruCompatible === false))
  );
  return pool.slice(0, n);
}

export function rerollCost(run) {
  return REROLL_BASE + run.rerollCount + 2 * run.roundIdx;
}

export { PRICE, sellValue };
