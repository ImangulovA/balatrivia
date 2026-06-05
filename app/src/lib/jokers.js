// Joker definitions. A joker is a set of optional event hooks that mutate the
// resolution context `ctx`. This is the extensible core: new enhancements just
// add hooks here.
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
  common: { label: 'Common', color: '#9ca3af' },
  uncommon: { label: 'Uncommon', color: '#02e2ac' },
  rare: { label: 'Rare', color: '#1877F2' },
  legendary: { label: 'Legendary', color: '#a855f7' }
};

export const PRICE = { common: 4, uncommon: 6, rare: 8, legendary: 10 };

export function sellValue(joker) {
  return Math.max(1, Math.floor(PRICE[joker.rarity] / 2));
}

// All defined jokers. `price` is derived from rarity for consistency.
const defs = [
  {
    id: 'historian',
    name: 'The Historian',
    rarity: 'common',
    desc: 'Correct History answers give +1 point.',
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
    desc: 'Every correct answer earns +$1.',
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
    desc: 'While on a streak of 3+, each correct answer earns +$2.',
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
    desc: 'Correct hard answers give +1 extra point.',
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
    desc: 'The first wrong answer each round costs no life.',
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
    desc: 'After a wrong answer, your next correct answer gives +1 point.',
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
    desc: 'Correct easy answers earn +$1; correct hard answers give +1 point.',
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
    desc: 'Correct All-in answers give +1 extra point.',
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
    // Behaviour lives in the UI: grants one retry on the first wrong submit
    // per question. Flagged here so the engine/UI can detect ownership.
    desc: 'Once per question, a wrong answer grants a second attempt.',
    grantsRetry: true,
    hooks: {}
  }
];

export const JOKERS = defs.map((j) => ({ ...j, price: PRICE[j.rarity] }));

export function jokerById(id) {
  return JOKERS.find((j) => j.id === id);
}
