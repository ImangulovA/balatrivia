// Joker definitions. A joker is a set of optional event hooks that mutate the
// resolution context `ctx`. This is the extensible core: new enhancements just
// add hooks here.
//
// Each joker also carries:
//   icon   - inline SVG (uses currentColor, themed to the rarity color)
//   desc   - short one-liner shown on the card
//   detail - rich explanation shown in the hover/focus tooltip
//
// ctx fields available to hooks:
//   ctx.question  { category, difficulty, ... }
//   ctx.bet       { id, ... }            the chosen bet
//   ctx.correct   boolean               was the typed answer right
//   ctx.points    number                points to award (mutate me)
//   ctx.money     number                money to award (mutate me)
//   ctx.life      number                life delta, e.g. -1 (mutate me)
//   ctx.endRound  boolean               does this end the round (mutate me)
//   ctx.run       { streak, roundFlags, ... }   run-level state

export const RARITY = {
  common: { label: 'Common', color: '#6B7280' },
  uncommon: { label: 'Uncommon', color: '#16A34A' },
  rare: { label: 'Rare', color: '#2A3FE5' },
  legendary: { label: 'Legendary', color: '#D97706' }
};

export const PRICE = { common: 4, uncommon: 6, rare: 8, legendary: 10 };

export function sellValue(joker) {
  return Math.max(1, Math.floor(PRICE[joker.rarity] / 2));
}

// --- inline pixel-ish SVG icons (24x24, currentColor) ---
const ICON = {
  column: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M4 5h16M5 19h14M8 8v8M12 8v8M16 8v8"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 6C10 4.5 6.5 4.5 4 6v12c2.5-1.5 6-1.5 8 0 2-1.5 5.5-1.5 8 0V6c-2.5-1.5-6-1.5-8 0zM12 6v12"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2s.8 3-1.2 5.2C9.5 9.7 7 11 7 15a6 6 0 0012 0c0-3-2-5-2.5-6 0 1.2-1 2-2 2 .8-3-1.5-7-1.5-9z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.6 5.6L20.5 9l-4.3 4.1 1.1 6L12 16.9 6.7 19.1l1.1-6L3.5 9l5.9-.4z"/></svg>',
  snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17M12 5l3-2M12 5L9 3M12 19l3 2M12 19l-3 2"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M20 12a8 8 0 11-2.5-5.8M20 3v5h-5"/></svg>',
  atom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/></svg>',
  die: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.4" fill="currentColor" stroke="none"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21S3.5 15.5 3.5 9.5C3.5 6.5 5.5 4.5 8 4.5c1.8 0 3.1 1 4 2.3 0.9-1.3 2.2-2.3 4-2.3 2.5 0 4.5 2 4.5 5C20.5 15.5 12 21 12 21z"/></svg>',
  coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M14 9.2a2.2 2.2 0 00-2-1.2c-1.2 0-2 .8-2 1.8s.8 1.6 2 1.8 2 .8 2 1.8-.8 1.8-2 1.8a2.2 2.2 0 01-2-1.2M12 6.5v11" stroke-width="1.6"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z"/></svg>'
};

// All defined jokers. `price` is derived from rarity for consistency.
const defs = [
  {
    id: 'historian',
    name: 'The Historian',
    rarity: 'common',
    icon: ICON.column,
    desc: 'Correct History answers give +1 point.',
    detail: 'Triggers on the History category (English mode). Answer a History question correctly and you score +1 point on top of your bet. Stacks with Double / All-in.',
    hooks: {
      onCorrect: (ctx) => {
        if (/history/i.test(ctx.question.category)) ctx.points += 1;
      }
    }
  },
  {
    id: 'scholar',
    name: 'Scholar',
    rarity: 'common',
    icon: ICON.book,
    desc: 'Every correct answer earns +$1.',
    detail: 'Pure economy. Every correct answer — any bet, any category — adds +$1. Buy it early to snowball money toward more jokers and shop interest.',
    hooks: {
      onCorrect: (ctx) => {
        ctx.money += 1;
      }
    }
  },
  {
    id: 'streak_demon',
    name: 'Streak Demon',
    rarity: 'common',
    icon: ICON.flame,
    desc: 'While on a streak of 3+, each correct answer earns +$2.',
    detail: 'Reward for not missing. Once your streak hits 3 in a row, every correct answer pays +$2. A single miss resets the streak to 0, so play safe to keep it burning.',
    hooks: {
      onCorrect: (ctx) => {
        if (ctx.run.streak >= 3) ctx.money += 2;
      }
    }
  },
  {
    id: 'underdog',
    name: 'The Underdog',
    rarity: 'uncommon',
    icon: ICON.star,
    desc: 'Correct hard answers give +1 extra point.',
    detail: 'Hard questions only. A correct answer to a hard-difficulty question gives +1 extra point. Pairs perfectly with Double or All-in on hard clues.',
    hooks: {
      onCorrect: (ctx) => {
        if (ctx.question.difficulty === 'hard') ctx.points += 1;
      }
    }
  },
  {
    id: 'cold_blood',
    name: 'Cold Blood',
    rarity: 'uncommon',
    icon: ICON.snow,
    desc: 'The first wrong answer each round costs no life.',
    detail: 'Insurance. The first wrong answer each round costs no life and never ends the round — even on an All-in bet. Resets every round, so you can gamble hard once per round.',
    hooks: {
      onWrong: (ctx) => {
        if (!ctx.run.roundFlags.coldBlood) {
          ctx.run.roundFlags.coldBlood = true;
          ctx.life = 0;
          ctx.endRound = false;
        }
      }
    }
  },
  {
    id: 'dropout',
    name: 'Dropout',
    rarity: 'uncommon',
    icon: ICON.refresh,
    desc: 'After a wrong answer, your next correct answer gives +1 point.',
    detail: 'Comeback fuel. After any wrong answer, your very next correct answer scores +1 extra point. Turns a stumble into momentum.',
    hooks: {
      onWrong: (ctx) => {
        ctx.run.roundFlags.dropoutArmed = true;
      },
      onCorrect: (ctx) => {
        if (ctx.run.roundFlags.dropoutArmed) {
          ctx.points += 1;
          ctx.run.roundFlags.dropoutArmed = false;
        }
      }
    }
  },
  {
    id: 'polymath',
    name: 'Polymath',
    rarity: 'uncommon',
    icon: ICON.atom,
    desc: 'Correct easy answers earn +$1; correct hard answers give +1 point.',
    detail: 'Scales by difficulty. Correct easy answers pay +$1 (economy); correct hard answers give +1 point (score). Medium questions are unaffected.',
    hooks: {
      onCorrect: (ctx) => {
        if (ctx.question.difficulty === 'easy') ctx.money += 1;
        if (ctx.question.difficulty === 'hard') ctx.points += 1;
      }
    }
  },
  {
    id: 'gambler',
    name: 'The Gambler',
    rarity: 'rare',
    icon: ICON.die,
    desc: 'Correct All-in answers give +1 extra point.',
    detail: 'All-in specialist. A correct All-in answer gives +1 extra point on top of the All-in bonus. Highest reward — but a miss still ends the round.',
    hooks: {
      onCorrect: (ctx) => {
        if (ctx.bet.id === 'allin') ctx.points += 1;
      }
    }
  },
  {
    id: 'second_chance',
    name: 'Second Chance',
    rarity: 'rare',
    icon: ICON.heart,
    desc: 'Once per question, a wrong answer grants a second attempt.',
    detail: 'Overrides the one-attempt rule. The first time you answer wrong on a question, you get one more try instead of failing it. Once per question.',
    // Behaviour lives in the UI: grants one retry on the first wrong submit.
    grantsRetry: true,
    hooks: {}
  },

  // ===== Scaling / economy / modifier-era jokers (from the design swarm) =====
  // Hooks take (ctx, j). Compounding jokers carry persistent state via initState().

  {
    id: 'warm_up', name: 'Warm-Up Act', rarity: 'common', icon: ICON.star,
    scaling: false, ruCompatible: true,
    desc: 'Your first correct answer each round gives +1 point.',
    detail: 'Pure tempo. The very first question you answer correctly in a round gives +1 extra point, banking progress early before difficulty bites. Resets every round. Works in EN and RU.',
    hooks: {
      onCorrect: (ctx) => {
        if (!ctx.run.roundFlags.warmUpUsed) { ctx.run.roundFlags.warmUpUsed = true; ctx.points += 1; }
      }
    }
  },
  {
    id: 'specialist', name: 'The Specialist', rarity: 'common', icon: ICON.column,
    scaling: true, ruCompatible: false,
    desc: 'Lock onto your first category; correct answers in it give +1, growing every 3 hits (max +3).',
    detail: 'The first category you answer correctly becomes your specialty. Correct answers in it give +1, growing +1 per 3 specialty hits, capped at +3. EN-only (ЧГК is one category), so it is hidden from RU shops.',
    initState: () => ({ cat: null, hits: 0 }),
    hooks: {
      onCorrect: (ctx, j) => {
        if (ctx.question.category === 'ЧГК') return;
        if (!j.state.cat) j.state.cat = ctx.question.category;
        if (ctx.question.category === j.state.cat) {
          j.state.hits += 1;
          ctx.points += 1 + Math.min(2, Math.floor(j.state.hits / 3));
        }
      }
    }
  },
  {
    id: 'compound_interest', name: 'Compound Interest', rarity: 'common', icon: ICON.coin,
    scaling: true, ruCompatible: true,
    desc: 'Pays +$ per correct, growing +$1 each round cleared (max +$5).',
    detail: 'An economy snowball. Starts at +$1 per correct; at the end of every round you clear, the bonus permanently ticks up by $1, up to +$5. Buy it early and it funds your late-game shop. Money only, never threatens the score ceiling.',
    initState: () => ({ lvl: 1 }),
    hooks: {
      onCorrect: (ctx, j) => { ctx.money += (j.state?.lvl ?? 1); },
      onRoundEnd: (ctx, j) => { if (ctx.cleared && j.state.lvl < 5) j.state.lvl += 1; }
    }
  },
  {
    id: 'kevlar_vest', name: 'Kevlar Vest', rarity: 'common', icon: ICON.shield,
    scaling: false, ruCompatible: true,
    desc: 'Your first Double miss each round costs no life.',
    detail: 'Narrower than Cold Blood: shields only a Double-bet miss (not All-in end, not Safe). Nudges you to bet Double aggressively when lives are scarce. Resets each round. Stacks with Cold Blood as a second one-shot shield.',
    hooks: {
      onWrong: (ctx) => {
        if (ctx.bet.id === 'double' && !ctx.run.roundFlags.kevlarUsed) {
          ctx.run.roundFlags.kevlarUsed = true; ctx.life = 0;
        }
      }
    }
  },
  {
    id: 'white_flag', name: 'White Flag', rarity: 'common', icon: ICON.refresh,
    scaling: false, ruCompatible: true,
    desc: 'Once per round, your first risky miss is consequence-free (no life, no round-end, no point).',
    detail: 'On the first Double/All-in miss each round, cancels the downside: no life lost, the round does not end, but you score nothing. A free pass you do not declare in advance. Safe misses do not consume the charge.',
    hooks: {
      onWrong: (ctx) => {
        if (ctx.run.roundFlags.whiteFlagUsed) return;
        if (ctx.bet.id === 'safe') return;
        ctx.run.roundFlags.whiteFlagUsed = true;
        if (ctx.bet.id === 'double') ctx.life = 0;
        if (ctx.bet.id === 'allin') ctx.endRound = false;
      }
    }
  },
  {
    id: 'martingale', name: 'Martingale', rarity: 'common', icon: ICON.die,
    scaling: false, ruCompatible: true,
    desc: 'Each wrong risky bet this round loads a charge; a correct All-in cashes up to +2 bonus points.',
    detail: 'A doubling-down gambler. Every wrong Double/All-in this round loads the spring; land an All-in and cash up to +2 bonus points on top of the base +3. Wrong All-ins still end the round. Charges reset each round. Bet-keyed, so it fires in RU.',
    hooks: {
      onRoundStart: (ctx) => { ctx.run.roundFlags.mart = 0; },
      onWrong: (ctx) => {
        if (ctx.bet.id === 'double' || ctx.bet.id === 'allin') ctx.run.roundFlags.mart = (ctx.run.roundFlags.mart || 0) + 1;
      },
      onCorrect: (ctx) => {
        if (ctx.bet.id === 'allin') { ctx.points += Math.min(2, ctx.run.roundFlags.mart || 0); ctx.run.roundFlags.mart = 0; }
      }
    }
  },
  {
    id: 'archivist', name: 'The Archivist', rarity: 'uncommon', icon: ICON.column,
    scaling: true, ruCompatible: true,
    desc: 'Every 3 correct banked over the run, your first correct each round is worth +1 more (max +3).',
    detail: 'A slow-burning score engine. Counts every correct across the run; for each 3 banked, a stored bonus rises by 1 (cap +3). Paid once per round, on your first correct answer, for a reliable head start against rising targets. Category-agnostic, fully RU-compatible.',
    initState: () => ({ count: 0, bonus: 0, firedThisRound: false }),
    hooks: {
      onRoundStart: (ctx, j) => { if (j.state) j.state.firedThisRound = false; },
      onCorrect: (ctx, j) => {
        j.state.count += 1; j.state.bonus = Math.min(3, Math.floor(j.state.count / 3));
        if (!j.state.firedThisRound && j.state.bonus > 0) { ctx.points += j.state.bonus; j.state.firedThisRound = true; }
      }
    }
  },
  {
    id: 'closer', name: 'The Closer', rarity: 'uncommon', icon: ICON.flame,
    scaling: false, ruCompatible: true,
    desc: 'On Q4 and Q5 of a round, correct risky answers give +1 point.',
    detail: 'A late-round clutch joker. On the 4th and 5th questions, a correct Double/All-in gives +1 extra. Tracks its own per-round counter. Gated to risk — forces you to gamble when difficulty peaks.',
    hooks: {
      onCorrect: (ctx) => {
        ctx.run.roundFlags.qSeen = (ctx.run.roundFlags.qSeen || 0) + 1;
        if (ctx.run.roundFlags.qSeen >= 4 && (ctx.bet.id === 'double' || ctx.bet.id === 'allin')) ctx.points += 1;
      },
      onWrong: (ctx) => { ctx.run.roundFlags.qSeen = (ctx.run.roundFlags.qSeen || 0) + 1; }
    }
  },
  {
    id: 'contrarian', name: 'Contrarian', rarity: 'uncommon', icon: ICON.coin,
    scaling: false, ruCompatible: true,
    desc: 'A wrong Safe bet pays you $2.',
    detail: 'Inverts the safe play. Bet Safe and miss, and instead of eating the zero you pocket $2 (Safe misses already cost no life). Turns low-confidence guesses into income without ever touching points or lives. RU-safe.',
    hooks: { onWrong: (ctx) => { if (ctx.bet.id === 'safe') ctx.money += 2; } }
  },
  {
    id: 'actuary', name: 'Actuary', rarity: 'uncommon', icon: ICON.shield,
    scaling: false, ruCompatible: true,
    desc: 'Once per round, a missed All-in costs 1 life instead of ending the round.',
    detail: 'The premier insurance for an All-in build. The first All-in miss each round becomes a survivable -1 life instead of an instant round loss. After it fires, All-in is lethal again. Still costs a life, so it smooths variance rather than raising the ceiling.',
    hooks: {
      onWrong: (ctx) => {
        if (ctx.bet.id === 'allin' && !ctx.run.roundFlags.actuaryUsed) {
          ctx.run.roundFlags.actuaryUsed = true; ctx.endRound = false; ctx.life = -1;
        }
      }
    }
  },
  {
    id: 'endowment', name: 'Endowment', rarity: 'uncommon', icon: ICON.book,
    scaling: true, ruCompatible: true,
    desc: 'Each correct gives +1 point per $8 banked (max +2).',
    detail: 'Money-scaling compounder with diminishing returns. Reads your bank (does not spend it): +1/correct at $8 banked, +2 at $16 (cap +2). Compounds as money grows, and creates a real dilemma — hoarding to power this competes with spending on jokers. RU-safe.',
    hooks: { onCorrect: (ctx) => { ctx.points += Math.min(2, Math.floor(ctx.run.money / 8)); } }
  },
  {
    id: 'library_card', name: 'Library Card', rarity: 'rare', icon: ICON.book,
    scaling: true, ruCompatible: true,
    desc: 'Every 4 correct this run, its per-correct point bonus permanently rises by +1 (max +3).',
    detail: 'A ledger that grows your per-correct yield. Starts at +0; every 4 correct, tier +=1 (cap 3 → +3/correct, reached ~16 correct in). Buy it early and it is dead weight; by the boss it carries your target. The slow ramp deliberately lags the curve. Category-agnostic, RU-compatible.',
    initState: () => ({ tier: 0, count: 0 }),
    hooks: {
      onCorrect: (ctx, j) => {
        j.state.count += 1;
        if (j.state.tier < 3 && j.state.count % 4 === 0) j.state.tier += 1;
        ctx.points += j.state.tier;
      }
    }
  },
  {
    id: 'avalanche', name: 'Avalanche', rarity: 'rare', icon: ICON.snow,
    scaling: true, ruCompatible: true,
    desc: 'Each correct adds +1 snow (max 6). A correct All-in cashes the whole stack as points, then resets.',
    detail: 'Charge-and-discharge. Accumulate snow on every correct (any bet), then cash the whole stack on a single correct All-in. Hold to charge, then spend on a gamble that gets scarier as hard-bias rises. Cap 6 + reset-on-spend keep it from passively dominating. RU-safe.',
    initState: () => ({ snow: 0 }),
    hooks: {
      onCorrect: (ctx, j) => {
        if (ctx.bet.id === 'allin') { ctx.points += j.state.snow; j.state.snow = 0; }
        else if (j.state.snow < 6) j.state.snow += 1;
      }
    }
  },
  {
    id: 'momentum_engine', name: 'Momentum Engine', rarity: 'rare', icon: ICON.flame,
    scaling: true, ruCompatible: true,
    desc: 'Bank +1 at each new even streak milestone (max 4); add the banked total to points on every correct.',
    detail: 'A clean streak compounder. Each time your streak reaches a fresh even number you bank a permanent +1 (cap 4). Every correct then adds the banked total. A wrong answer resets only the milestone tracker (not the bank), so milestones re-arm. Capped at +4/correct. Streak-keyed → works in RU.',
    initState: () => ({ charges: 0, lastMilestone: 0 }),
    hooks: {
      onCorrect: (ctx, j) => {
        const s = ctx.run.streak + 1; // streak updates AFTER hooks
        if (s % 2 === 0 && s > j.state.lastMilestone) { j.state.lastMilestone = s; j.state.charges = Math.min(4, j.state.charges + 1); }
        ctx.points += j.state.charges;
      },
      onWrong: (ctx, j) => { j.state.lastMilestone = 0; }
    }
  },
  {
    id: 'field_medic', name: 'Field Medic', rarity: 'rare', icon: ICON.heart,
    scaling: true, ruCompatible: true,
    desc: 'Clear a round with lives to spare and permanently gain +1 starting life next rounds (cap +3).',
    detail: 'A compounding defensive scaler. Clear a round with leftover lives and permanently raise your starting lives, up to +3. Rewards careful play and builds a cushion for boss rounds — without granting points, so it never touches the ceiling.',
    initState: () => ({ bonus: 0 }),
    hooks: {
      onRoundStart: (ctx, j) => { ctx.life += (j.state.bonus || 0); },
      onRoundEnd: (ctx, j) => { if (ctx.cleared && ctx.livesLeft > 0 && j.state.bonus < 3) j.state.bonus += 1; }
    }
  },
  {
    id: 'magnum_opus', name: 'Magnum Opus', rarity: 'legendary', icon: ICON.star,
    scaling: true, ruCompatible: true,
    desc: 'Each flawless round cleared: permanent +1 on All-in wins AND +$1 per correct (each cap +3).',
    detail: 'The masterpiece build. Clear a round with zero wrong answers and both stored bonuses tick up: +1 on every correct All-in, and +$1 per correct (each cap +3). A single wrong answer in a round earns no tick that round. Triple-throttled: All-in-only points, flawless-only growth, +3 caps.',
    initState: () => ({ ptLvl: 0, moneyLvl: 0 }),
    hooks: {
      onRoundStart: (ctx) => { ctx.run.roundFlags.opusBroken = false; },
      onWrong: (ctx) => { ctx.run.roundFlags.opusBroken = true; },
      onCorrect: (ctx, j) => { ctx.money += j.state.moneyLvl; if (ctx.bet.id === 'allin') ctx.points += j.state.ptLvl; },
      onRoundEnd: (ctx, j) => {
        if (ctx.cleared && !ctx.run.roundFlags.opusBroken) {
          j.state.ptLvl = Math.min(3, j.state.ptLvl + 1); j.state.moneyLvl = Math.min(3, j.state.moneyLvl + 1);
        }
      }
    }
  }
];

export const JOKERS = defs.map((j) => ({ ...j, price: PRICE[j.rarity] }));

export function jokerById(id) {
  return JOKERS.find((j) => j.id === id);
}
