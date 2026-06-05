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

// 8 rounds, ALWAYS 5 questions each (you play all 5 even after hitting target).
// Targets are scaled for 5 questions: >5 requires betting (Double/All-in). Boss = 7.
export const QUESTIONS_PER_ROUND = 5;
export const ROUNDS = [
  { target: 2, lives: 2, questions: 5, hardBias: 0.15 },
  { target: 3, lives: 2, questions: 5, hardBias: 0.2 },
  { target: 4, lives: 2, questions: 5, hardBias: 0.3 },
  { target: 4, lives: 3, questions: 5, hardBias: 0.4 },
  { target: 5, lives: 3, questions: 5, hardBias: 0.5 },
  { target: 5, lives: 3, questions: 5, hardBias: 0.6 },
  { target: 6, lives: 3, questions: 5, hardBias: 0.7 },
  { target: 7, lives: 3, questions: 5, hardBias: 0.8 }
];

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
export function newRun() {
  return {
    roundIdx: 0,
    money: STARTING_MONEY,
    jokers: [], // array of joker defs (max MAX_JOKERS)
    seenIds: new Set(), // questions used this run, avoid repeats
    streak: 0,
    roundFlags: {},
    rerollCount: 0
  };
}

// Pick the questions for the current round, biased toward hard in later rounds,
// avoiding questions already seen this run.
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

// Resolve a single answered question. Mutates `run` (streak, roundFlags) and
// returns the effects to apply at the round level.
export function resolve(run, question, bet, correct) {
  const ctx = {
    run,
    question,
    bet,
    correct,
    points: 0,
    money: 0,
    life: 0,
    endRound: false
  };

  if (correct) {
    ctx.points = bet.points;
    ctx.money = bet.money;
  } else {
    ctx.life = bet.lifeOnLoss;
    ctx.endRound = bet.endsRoundOnLoss;
  }

  // fire joker hooks (onCorrect / onWrong). Streak is updated AFTER so that
  // onCorrect hooks see the streak that led into this answer.
  const hookName = correct ? 'onCorrect' : 'onWrong';
  for (const j of run.jokers) {
    const fn = j.hooks && j.hooks[hookName];
    if (fn) fn(ctx);
  }

  if (correct) run.streak += 1;
  else run.streak = 0;

  return ctx;
}

// Money awarded for clearing a round.
export function roundReward(run, livesLeft, points, target) {
  const cfg = ROUNDS[run.roundIdx];
  const base = 3 + run.roundIdx; // later rounds pay more
  const lifeBonus = livesLeft; // $1 per surviving life
  const overfill = Math.max(0, points - target); // $1 per extra point
  const interest = Math.min(5, Math.floor(run.money / 5)); // +$1 per $5 banked, cap 5
  void cfg;
  return { base, lifeBonus, overfill, interest, total: base + lifeBonus + overfill + interest };
}

// Build a shop offer of up to `n` jokers the player does not already own.
export function rollShop(run, n = 3) {
  const owned = new Set(run.jokers.map((j) => j.id));
  const pool = shuffle(JOKERS.filter((j) => !owned.has(j.id)));
  return pool.slice(0, n);
}

export function rerollCost(run) {
  return REROLL_BASE + run.rerollCount;
}

export { PRICE, sellValue };
