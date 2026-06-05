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
  heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21S3.5 15.5 3.5 9.5C3.5 6.5 5.5 4.5 8 4.5c1.8 0 3.1 1 4 2.3 0.9-1.3 2.2-2.3 4-2.3 2.5 0 4.5 2 4.5 5C20.5 15.5 12 21 12 21z"/></svg>'
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
  }
];

export const JOKERS = defs.map((j) => ({ ...j, price: PRICE[j.rarity] }));

export function jokerById(id) {
  return JOKERS.find((j) => j.id === id);
}
