I now have full ground truth on the engine. The key facts: `resolve()` fires only `onCorrect`/`onWrong` with `fn(ctx)` (no joker instance passed); jokers are pushed by reference into `run.jokers`; `roundReward` hardcodes interest cap 5 and base `3+roundIdx`; round-clear/fail logic lives in `+page.svelte` `next()`/`clearRound()`/`gameOver()`; no `onRoundStart`/`onRoundEnd`/`onShop` fire anywhere; UI reads `j.price`, `betKeys`, `MAX_JOKERS`.

Now I'll synthesize the full proposal.

# Balatrivia — Scaling Redesign Proposal

This synthesizes the four scaling lenses and six joker batches into one implementation-ready plan, grounded in the actual code in `app/src/lib/engine.js`, `app/src/lib/jokers.js`, and `app/src/routes/+page.svelte`. The governing principle from the research: **difficulty must rise slightly faster than baseline player power so decisions matter, and because Variant-2 score is bounded and low, scaling comes from compounding jokers + per-question yield + boss/round modifiers — never exponential targets.**

---

## 1. Scaling redesign

### 1.1 The core problem with the current curve

The current `ROUNDS` (engine.js lines 37-46) does three things backwards:

- **Lives LOOSEN late** (`[2,2,2,3,3,3,3,3]`): the boss is safer than the opener. This rewards passive all-Safe coasting exactly when difficulty should bite.
- **Targets are flat-ish** (`[2,3,4,4,5,5,6,7]`): two plateaus (4,4 and 5,5) create dead rounds where nothing changes.
- **Economy has no growing sink** (base `3+roundIdx`, fixed interest cap 5, static prices): by round 6 a player floats on cash with nothing to pressure them.

A passive all-Safe player's expected points actually *decay* over the run (from ~3.7 to ~2.6) because `hardBias` rises and hard questions are ~0.45 correct vs ~0.78 easy/medium. So even a linearly-rising target opens a widening shortfall. That is the lever — we just have to aim it.

### 1.2 Recommended `ROUNDS` array

Replace lines 37-46 of `engine.js`:

```js
export const QUESTIONS_PER_ROUND = 5;
// roundIdx is the source of truth for all curve arrays below.
export const ROUNDS = [
  { target: 2, lives: 3, questions: 5, hardBias: 0.10 },
  { target: 3, lives: 3, questions: 5, hardBias: 0.20 },
  { target: 4, lives: 3, questions: 5, hardBias: 0.30, mod: 'recession' },
  { target: 5, lives: 2, questions: 5, hardBias: 0.40, mod: 'the_wall' },     // BOSS 1
  { target: 6, lives: 2, questions: 5, hardBias: 0.50 },
  { target: 6, lives: 2, questions: 5, hardBias: 0.60, mod: 'double_jeopardy' },
  { target: 7, lives: 2, questions: 5, hardBias: 0.70, mod: 'dry_spell' },
  { target: 8, lives: 2, questions: 5, hardBias: 0.85, mod: 'sudden_death' }  // BOSS 2 (final)
];
```

| Lever | Current | Proposed | Rationale |
|---|---|---|---|
| targets | `[2,3,4,4,5,5,6,7]` | `[2,3,4,5,6,6,7,8]` | Smoother climb, no dead plateaus; round-6 holds at 6 to make room for Double Jeopardy; final at 8 (under the ~10 all-Double ceiling but unreachable passively). |
| lives | `[2,2,2,3,3,3,3,3]` | `[3,3,3,2,2,2,2,2]` | **Reversed.** Forgiving opener (eases new players), tightens to 2 from round 4 so aggressive betting carries real risk when `hardBias` makes misses likely. |
| hardBias | `[.15,.2,.3,.4,.5,.6,.7,.8]` | `[.10,.20,.30,.40,.50,.60,.70,.85]` | Clean steps, gentler opener; final pushed to 0.85 as the EN difficulty capstone. |

**Why this is the productive gap (modeled):**
- *Passive all-Safe margin* (E[pts] − target): `+1.7, +0.6, −0.6, −1.8, −2.9, −4.1, −5.3, −6.4`. A passive build dies around round 3-4 and is hopeless by the boss.
- *Built margin* (aggressive betting + a compounding/extra-yield joker adding ~0.6×round): stays positive but shrinks to razor-thin at the boss. Decisions matter most exactly when it is hardest.

**RU caveat (critical):** ЧГК questions are all `difficulty: 'medium'`, so `hardBias` is **inert in RU** — `dealRound`'s `wantHard` branch never fires (there is no hard pool). RU difficulty therefore comes *entirely* from the target+lives curve (which already climbs 2→8) plus the economy and bet-keyed modifiers. The category/difficulty-keyed modifiers below must be substituted in RU (see substitution table).

### 1.3 Boss / round-modifier system

This is the difficulty-spike lever Balatro uses (Boss Blinds) and the cleanest knob given a bounded ceiling: instead of inflating targets, **restrict the player's toolkit** so the same low target becomes hard. I recommend **2 full bosses (rounds 4 and 8)** plus **2 mini-mods (rounds 3 and 6/7)** to create sawtooth pacing — bosses are peaks, shops are relief, clean rounds (1,2,5) are breathing room.

**Engine prerequisite — a hook dispatcher.** Today `resolve()` only fires `onCorrect`/`onWrong`. Add one generic dispatcher and wire the lifecycle hooks (this also unlocks the compounding jokers in §2/§3):

```js
// engine.js — fire a named hook across modifiers THEN jokers.
// Modifiers fire first so jokers (Cold Blood, Second Chance) can partially counter them.
export function fireHook(run, name, ctx) {
  ctx.run = run;
  for (const m of activeMods(run)) {            // modifiers from ROUNDS[roundIdx].mod
    const fn = m.hooks && m.hooks[name];
    if (fn) fn(ctx, m);
  }
  for (const j of run.jokers) {
    if (run.roundFlags.jammedIds?.includes(j.id)) continue; // Jammer support
    const fn = j.hooks && j.hooks[name];
    if (fn) fn(ctx, j);                          // pass instance for state (see §2)
  }
  return ctx;
}
```

`resolve()` becomes a thin wrapper that seeds the base bet effects then calls `fireHook(run, correct ? 'onCorrect' : 'onWrong', ctx)`. The other lifecycle hooks are fired from the points listed in the checklist (§4).

**Modifier definitions** (live in a `MODIFIERS` map in engine.js, keyed by the `mod` string on `ROUNDS`):

| id | Name | Effect | How implemented | RU |
|---|---|---|---|---|
| `recession` | Recession | Lose $3 at round start | `onRoundStart`: `ctx.run.money = Math.max(0, ctx.run.money - 3)` | ✅ |
| `the_wall` | The Wall | Safe bets disabled all round | UI: filter `betKeys` against `cfg.modData.lockBets=['safe']`; default `bet='double'` in `resetQuestion()` | ✅ |
| `double_jeopardy` | Double Jeopardy | Penalized miss costs 2 lives | `onWrong`: `if (ctx.life < 0) ctx.life *= 2` (fires before Cold Blood so insurance can still zero it) | ✅ |
| `dry_spell` | Dry Spell | Points above target voided; no overfill $ | `onCorrect`: `if (ctx.roundPoints >= cfg.target) ctx.points = 0`; `roundReward` sets `overfill=0` | ✅ |
| `sudden_death` | Sudden Death | All-in only; any miss ends round | UI: `lockBets=['safe','double']`, default `bet='allin'` | ✅ |
| `jammer` | Jammer | Strongest owned joker disabled this round | `onRoundStart`: set `run.roundFlags.jammedIds=[highestRarityJoker.id]`; dispatcher skips it | ✅ |
| `specialist` | Specialist | All 5 Qs one category | `dealRound`: if `cfg.modData.lockCategory`, pick one category and filter draws | ❌ no-op in RU |
| `brutal` | Brutal Curve | First 2 Qs forced hard | `dealRound`: deal N from hard pool first | ❌ no-op in RU |

**RU substitution table** (enforce at round start; never display a no-op boss banner):
- `specialist` → `recession`
- `brutal` → `the_wall`
- `hardBias` capstone portion → handled by the target curve alone.

**Modifier assignment in the recommended curve:** round 3 `recession` (mini), round 4 `the_wall` (boss 1), round 6 `double_jeopardy` (mini), round 7 `dry_spell` (mini), round 8 `sudden_death` (final boss). I deliberately **do not stack** Jammer + Sudden Death + Time-Pressure on the final round on first release — that triple-stack risks tanking win-rate below a healthy ~30%. Ship Sudden Death alone, add Jammer behind a playtest.

**Boss banner:** show `cfg.modData.name` / `.desc` on the round screen (mirrors Balatro's boss reveal). Since the `mod` is already declared on `ROUNDS`, the UI just reads it on `startRound()`.

### 1.4 Economy tweaks

The economy needs a **growing sink** so banked cash loses real value late, forcing spend-vs-save. All levers are `$`-only (never touch points/lives directly), so they preserve the bounded ceiling and are fully RU-compatible. Apply in `roundReward`, a new `upkeepCost`, `jokerPrice`, and `rerollCost`. All arrays index by `run.roundIdx` (the just-cleared round; shop opens before `nextRound` increments — pin this in a comment).

```js
const BASE_BY_ROUND  = [4, 4, 5, 5, 6, 6, 7, 8];   // replaces base = 3 + roundIdx
const INTEREST_CAP   = [5, 5, 5, 4, 4, 3, 2, 2];   // hoarding stops paying late
const UPKEEP_RATE    = [0, 0, 0, 0, 1, 1, 2, 3];   // $ per owned joker, charged at shop entry
```

- **Tiered base income** `[4,4,5,5,6,6,7,8]`: pays generously early to fund a core build, flattens late so late cash must come from *play* (overfill, All-in $), not a fat clear bonus.
- **Decaying interest cap** `[5,5,5,4,4,3,2,2]`: same `$1/$5` rate, but a `$25` bank that earned `$5` early earns only `$2` by the boss. Removes the late hoard plateau. `interest = Math.min(INTEREST_CAP[run.roundIdx], Math.floor(run.money/5))`.
- **Operating Cost (upkeep)** — the centerpiece sink. At shop entry from round 5 on, pay `UPKEEP_RATE[roundIdx] * jokers.length`. A full 5-joker board pays `$5,$5,$10,$15` into rounds 5-8 ($35 total); a lean 3-joker board pays `$3,$3,$6,$9`. **Paid in $ only** — if you can't pay, you *choose* which joker to sell (player agency, partial refund), never a forced life/point loss. This turns a passive 5-joker board from pure upside into a recurring liability that scales with board size *and* round — the productive gap, applied to the build. Pair with Scholar/Streak Demon (both RU-safe) to feed it.
- **Round-indexed price inflation:** `jokerPrice = ceil(PRICE[rarity] * (1 + 0.10*roundIdx))` and `rerollCost = 5 + rerollCount + 2*roundIdx`. Early decisive buys are strictly cheaper than late fishing. **Keep `sellValue` tied to base rarity** (`floor(PRICE/2)`) so there is no buy-low/sell-high arbitrage.

**Worked sanity check (lean 3-joker money build):** start `$4`; afford a Common+Uncommon core by round 3; bank peaks ~`$18-22` around round 4-5; rounds 5-8 upkeep ($21) + inflated prices drain it so you finish the boss near `$5-10`, not `$40+`. A greedy 5-joker board costs `$35` in upkeep alone — only sustainable if you run a money engine. Intended tension.

**Do not double-tax:** if you ship the steeper §1.2 target curve *and* the full economy sink *and* the new compounding jokers all at once, you may overshoot. Recommended release order in §4: ship the curve + modifiers + jokers first against the *current* economy, then layer the upkeep sink once win-rate data exists.

---

## 2. Compounding scaling pattern

The missing archetype. Every existing joker is flat-additive: it pays the same the moment you buy it and never grows. With a bounded ceiling and rising targets, flat builds plateau. The fix is **jokers that start weak and grow via persistent per-instance state**, so an early buy pays off late — rewarding planning and the save-vs-spend economy.

### The reusable contract

1. **State lives on the joker instance:** `j.state = {...}`, initialized by an optional `j.initState()`.
2. **Growth trigger:** a hook increments a counter on `j.state` when a condition is met (usually `onCorrect` or `onRoundEnd`).
3. **Payout:** a hook reads `j.state` and contributes to `ctx.points`/`ctx.money`.
4. **Hard cap:** every snowball has an explicit ceiling on its state so it can never trivialize the boss. Caps are the safety valve that keeps difficulty ahead — most are tuned so a single snowball contributes at most ~+2/correct and most never fully max.
5. **RU-awareness:** snowballs keyed on "any correct", streak, rounds-survived, money, or all-in fire in RU; category/difficulty-keyed ones are flagged.

### Minimal engine changes (three small, backward-compatible edits)

1. **Clone-and-init on acquire (critical).** Today `buy()` does `run.jokers = [...run.jokers, j]`, pushing the **shared module-level object** from `JOKERS` (built once via `defs.map(j => ({...j}))`). Any `j.state` would leak across the shop list and across runs. Fix `buy()`:
   ```js
   const inst = { ...j, state: j.initState ? j.initState() : undefined };
   run.jokers = [...run.jokers, inst];
   ```
   (Re-buying after a sell resets state — acceptable; the player loses the buildup.)

2. **Pass the instance to hooks.** Change the `resolve()`/`fireHook` loop from `fn(ctx)` to `fn(ctx, j)`. Existing jokers ignore the 2nd arg, so this is **backward-compatible**.

3. **Fire `onRoundStart` / `onRoundEnd`.** Wire them (see §4). `onRoundEnd`'s ctx must expose `ctx.cleared` (bool) and `ctx.run` so a joker can grow only on a cleared round. Until wired, only `onCorrect`-keyed snowballs work.

Also extend the `resolve()` ctx with `ctx.roundPoints` (current round score) and `ctx.cfg` so per-round soft-caps (Dry Spell, Archivist's once-per-round payout) can read them.

---

## 3. New jokers

Applying the critics' fixes. These are drop-in ready for `jokers.js` `defs[]`. Hooks use `(ctx, j)` where state is needed. I've kept the existing icon palette references; new icons noted as ideas. **15 jokers** across the rarities, spanning compounding, conditional, economy, risk/reward, defensive, and utility.

> Engine assumptions for all: `(ctx, j)` hook signature; `j.state` initialized via `initState`; `onRoundStart`/`onRoundEnd` fired with `ctx.cleared`; joker hooks fire **after** the core bet penalty so `ctx.life`/`ctx.endRound` overrides hold.

### Common

```js
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
}
```

```js
{
  id: 'specialist', name: 'The Specialist', rarity: 'common', icon: ICON.column,
  scaling: true, ruCompatible: false, // RU collapses to one category; guarded + disabled in RU shops
  desc: 'Lock onto the first category you get right; correct answers in it give +1, growing every 3 hits (max +3).',
  detail: 'The first category you answer correctly becomes your specialty. Correct answers in it give +1, growing +1 per 3 specialty hits, capped at +3. EN-only: dead in ЧГК (single category), so it is hidden from RU shops.',
  initState: () => ({ cat: null, hits: 0 }),
  hooks: {
    onCorrect: (ctx, j) => {
      if (ctx.question.category === 'ЧГК') return;            // RU guard: never lock onto ЧГК
      if (!j.state.cat) j.state.cat = ctx.question.category;
      if (ctx.question.category === j.state.cat) {
        j.state.hits += 1;
        ctx.points += 1 + Math.min(2, Math.floor(j.state.hits / 3)); // FIX: capped at +3
      }
    }
  }
}
```

```js
{
  id: 'compound_interest', name: 'Compound Interest', rarity: 'common', icon: ICON.book,
  scaling: true, ruCompatible: true,
  desc: 'Pays +$ per correct, growing +$1 each round cleared (max +$5).',
  detail: 'An economy snowball. Starts at +$1 per correct; at the end of every round you clear, the bonus permanently ticks up by $1, up to +$5. Buy it early and it funds your late-game shop. Money only, never threatens the score ceiling.',
  initState: () => ({ lvl: 1 }),
  hooks: {
    onCorrect: (ctx, j) => { ctx.money += (j.state?.lvl ?? 1); },
    onRoundEnd: (ctx, j) => { if (ctx.cleared && j.state.lvl < 5) j.state.lvl += 1; }
  }
}
```

```js
{
  id: 'kevlar_vest', name: 'Kevlar Vest', rarity: 'common', icon: ICON.heart,
  scaling: false, ruCompatible: true,
  desc: 'Your first Double miss each round costs no life.',
  detail: 'Narrower than Cold Blood: shields only a Double-bet miss (not All-in end, not Safe). Nudges you to bet Double aggressively when lives are scarce. Resets each round. Stacks with Cold Blood as a second one-shot shield.',
  hooks: {
    // fires AFTER core penalty; refunds the -1 about to stand
    onWrong: (ctx) => {
      if (ctx.bet.id === 'double' && !ctx.run.roundFlags.kevlarUsed) {
        ctx.run.roundFlags.kevlarUsed = true; ctx.life = 0;
      }
    }
  }
}
```

```js
{
  id: 'white_flag', name: 'White Flag', rarity: 'common', icon: ICON.refresh,
  scaling: false, ruCompatible: true,
  desc: 'Once per round, your first penalized miss is consequence-free (no life, no round-end, no point).',
  detail: 'On the first Double/All-in miss each round, cancels the downside: no life lost, the round does not end, but you score nothing. A free pass you do not declare in advance. Never grants points. Safe misses do not consume the charge.',
  hooks: {
    onWrong: (ctx) => {
      if (ctx.run.roundFlags.whiteFlagUsed) return;
      if (ctx.bet.id === 'safe') return;                   // FIX: don't waste charge on free Safe miss
      ctx.run.roundFlags.whiteFlagUsed = true;
      if (ctx.bet.id === 'double') ctx.life = 0;
      if (ctx.bet.id === 'allin') ctx.endRound = false;
    }
  }
}
```

```js
{
  id: 'martingale', name: 'Martingale', rarity: 'common', icon: ICON.die,
  scaling: false, ruCompatible: true,
  desc: 'Each wrong Double/All-in this round loads a charge; a correct All-in cashes up to +2 bonus points.',
  detail: 'A doubling-down gambler. Every wrong RISKY bet this round loads the spring; land an All-in and cash up to +2 bonus points on top of the base +3. Wrong All-ins still end the round. Charges reset each round. Bet-keyed, so it fires in RU.',
  hooks: {
    onRoundStart: (ctx) => { ctx.run.roundFlags.mart = 0; },
    onWrong: (ctx) => {                                     // FIX: only risky misses load (kills Safe-punt farm)
      if (ctx.bet.id === 'double' || ctx.bet.id === 'allin') ctx.run.roundFlags.mart = (ctx.run.roundFlags.mart || 0) + 1;
    },
    onCorrect: (ctx) => {
      if (ctx.bet.id === 'allin') { ctx.points += Math.min(2, ctx.run.roundFlags.mart || 0); ctx.run.roundFlags.mart = 0; }
    }
  }
}
```

### Uncommon

```js
{
  id: 'archivist', name: 'The Archivist', rarity: 'uncommon', icon: ICON.column,
  scaling: true, ruCompatible: true,
  desc: 'Every 3 correct answers banked over the run, your first correct each round is worth +1 more (max +3).',
  detail: 'A slow-burning score engine. Counts every correct across the run; for each 3 banked, a stored bonus rises by 1 (cap +3). Paid once per round, on your first correct answer, for a reliable head start against rising targets. Category-agnostic, fully RU-compatible.',
  initState: () => ({ count: 0, bonus: 0, firedThisRound: false }),
  hooks: {
    onRoundStart: (ctx, j) => { if (j.state) j.state.firedThisRound = false; },
    onCorrect: (ctx, j) => {
      j.state.count += 1; j.state.bonus = Math.min(3, Math.floor(j.state.count / 3));
      if (!j.state.firedThisRound && j.state.bonus > 0) { ctx.points += j.state.bonus; j.state.firedThisRound = true; }
    }
  }
}
```

```js
{
  id: 'closer', name: 'The Closer', rarity: 'uncommon', icon: ICON.flame,
  scaling: false, ruCompatible: true,
  desc: 'On Q4 and Q5 of a round, correct Double/All-in answers give +1 point.',
  detail: 'A late-round clutch joker. On the 4th and 5th questions, a correct risky bet gives +1 extra. Tracks its own per-round counter, so it needs no question index from the engine. Capped at +2/round and gated to risk — forces you to gamble when difficulty peaks.',
  hooks: {
    onCorrect: (ctx) => {
      ctx.run.roundFlags.qSeen = (ctx.run.roundFlags.qSeen || 0) + 1;
      if (ctx.run.roundFlags.qSeen >= 4 && (ctx.bet.id === 'double' || ctx.bet.id === 'allin')) ctx.points += 1;
    },
    onWrong: (ctx) => { ctx.run.roundFlags.qSeen = (ctx.run.roundFlags.qSeen || 0) + 1; }
  }
}
```

```js
{
  id: 'contrarian', name: 'Contrarian', rarity: 'uncommon', icon: ICON.die,
  scaling: false, ruCompatible: true,
  desc: 'A wrong Safe bet pays you $2.',
  detail: 'Inverts the safe play. Bet Safe and miss, and instead of eating the zero you pocket $2 (Safe misses already cost no life). Turns low-confidence guesses into income without ever touching points or lives. Opportunity cost: you forgo Double/All-in upside on questions you Safe-punt. RU-safe.',
  hooks: { onWrong: (ctx) => { if (ctx.bet.id === 'safe') ctx.money += 2; } }
}
```

```js
{
  id: 'actuary', name: 'Actuary', rarity: 'uncommon', icon: ICON.heart,
  scaling: false, ruCompatible: true,
  desc: 'Once per round, a missed All-in costs 1 life instead of ending the round.',
  detail: 'The premier insurance for an All-in build. The first All-in miss each round becomes a survivable -1 life instead of an instant round loss. After it fires, All-in is lethal again. Still costs a life (and if lives are already 0, the run ends), so it smooths variance rather than raising the ceiling.',
  hooks: {
    onWrong: (ctx) => {
      if (ctx.bet.id === 'allin' && !ctx.run.roundFlags.actuaryUsed) {
        ctx.run.roundFlags.actuaryUsed = true; ctx.endRound = false; ctx.life = -1;
      }
    }
  }
}
```

```js
{
  id: 'endowment', name: 'Endowment', rarity: 'uncommon', icon: ICON.book,
  scaling: true, ruCompatible: true,
  desc: 'Each correct gives +1 point per $8 banked (max +2).',
  detail: 'Money-scaling compounder with diminishing returns. Reads your bank (does not spend it): +1/correct at $8 banked, +2 at $16 (cap +2). Compounds indirectly as money grows over the run, and creates a real dilemma — hoarding to power this competes with spending on jokers and rerolls. RU-safe.',
  initState: () => ({}),
  hooks: { onCorrect: (ctx) => { ctx.points += Math.min(2, Math.floor(ctx.run.money / 8)); } }
}
```

### Rare

```js
{
  id: 'library_card', name: 'Library Card', rarity: 'rare', icon: ICON.book,
  scaling: true, ruCompatible: true,
  desc: 'Every 4 correct answers this run, its per-correct point bonus permanently rises by +1 (max +3).',
  detail: 'A ledger that grows your per-correct yield. Starts at +0; every 4 correct, tier += 1 (cap 3 → +3/correct, reached ~16 correct in). Buy it early and it is dead weight; by the boss it carries your target. The slow ramp deliberately lags the curve. Category-agnostic, RU-compatible.',
  initState: () => ({ tier: 0, count: 0 }),
  hooks: {
    onCorrect: (ctx, j) => {
      j.state.count += 1;
      if (j.state.tier < 3 && j.state.count % 4 === 0) j.state.tier += 1;
      ctx.points += j.state.tier;
    }
  }
}
```

```js
{
  id: 'avalanche', name: 'Avalanche', rarity: 'rare', icon: ICON.snow,
  scaling: true, ruCompatible: true,
  desc: 'Each correct adds +1 snow (max 6). A correct All-in cashes the whole stack as points, then resets.',
  detail: 'Charge-and-discharge. Accumulate snow on every correct (any bet), then cash the whole stack on a single correct All-in. Creates a real decision: hold to charge, then spend on a gamble that gets scarier as hard-bias rises. Cap 6 + reset-on-spend keep it from passively dominating. Show snow on the card. RU-safe.',
  initState: () => ({ snow: 0 }),
  hooks: {
    onCorrect: (ctx, j) => {
      if (ctx.bet.id === 'allin') { ctx.points += j.state.snow; j.state.snow = 0; }
      else if (j.state.snow < 6) j.state.snow += 1;
    }
  }
}
```

```js
{
  id: 'momentum_engine', name: 'Momentum Engine', rarity: 'rare', icon: ICON.flame,
  scaling: true, ruCompatible: true,
  desc: 'Bank +1 at each new even streak milestone (max 4); add the banked total to points on every correct.',
  detail: 'A clean streak compounder. Each time your streak reaches a fresh even number you bank a permanent +1 (cap 4). Every correct answer then adds the full banked total. A wrong answer resets only the milestone tracker (not the bank), so milestones can re-arm. Capped at +4/correct. Streak-keyed, so it works in RU.',
  initState: () => ({ charges: 0, lastMilestone: 0 }),
  hooks: {
    onCorrect: (ctx, j) => {                                // FIX: bank-and-add, not bank-and-spend
      const s = ctx.run.streak + 1;                         // streak updates AFTER hooks
      if (s % 2 === 0 && s > j.state.lastMilestone) { j.state.lastMilestone = s; j.state.charges = Math.min(4, j.state.charges + 1); }
      ctx.points += j.state.charges;
    },
    onWrong: (ctx, j) => { j.state.lastMilestone = 0; }
  }
}
```

```js
{
  id: 'field_medic', name: 'Field Medic', rarity: 'rare', icon: ICON.heart,
  scaling: true, ruCompatible: true,
  desc: 'Clear a round with lives to spare and permanently gain +1 max life next rounds (cap +3).',
  detail: 'A compounding defensive scaler. Clear a round with leftover lives and permanently raise your starting lives, up to +3. Rewards careful play and builds a cushion for boss rounds — without granting any points, so it never touches the ceiling. Extra lives never help reach a high TARGET, so difficulty still outpaces a pure-defense build.',
  initState: () => ({ bonus: 0 }),
  hooks: {
    onRoundStart: (ctx, j) => { ctx.life += (j.state.bonus || 0); },   // applied AFTER base round lives
    onRoundEnd: (ctx, j) => { if (ctx.cleared && ctx.life > 0 && j.state.bonus < 3) j.state.bonus += 1; } // FIX: gate on real clear
  }
}
```

### Legendary

```js
{
  id: 'magnum_opus', name: 'Magnum Opus', rarity: 'legendary', icon: ICON.star,
  scaling: true, ruCompatible: true,
  desc: 'Each flawless (no-wrong) round cleared: permanent +1 on All-in wins AND +$1 per correct (each cap +3).',
  detail: 'The masterpiece build. Clear a round with zero wrong answers and both stored bonuses tick up: +1 on every correct All-in, and +$1 per correct (each cap +3). A single wrong answer in a round earns no tick that round (any miss breaks it — Cold Blood does not help). Triple-throttled: All-in-only points, flawless-only growth, +3 caps. Outpaced if you slip.',
  initState: () => ({ ptLvl: 0, moneyLvl: 0 }),
  hooks: {
    onRoundStart: (ctx, j) => { ctx.run.roundFlags.opusBroken = false; },
    onWrong: (ctx) => { ctx.run.roundFlags.opusBroken = true; },
    onCorrect: (ctx, j) => { ctx.money += j.state.moneyLvl; if (ctx.bet.id === 'allin') ctx.points += j.state.ptLvl; },
    onRoundEnd: (ctx, j) => {
      if (ctx.cleared && !ctx.run.roundFlags.opusBroken) {
        j.state.ptLvl = Math.min(3, j.state.ptLvl + 1); j.state.moneyLvl = Math.min(3, j.state.moneyLvl + 1);
      }
    }
  }
}
```

**Cut from the swarm (do not implement):**
- **High Roller / Phoenix** (both variants): the +points-on-Double or +points-on-miss versions break the bounded ceiling (a clean Double round + flat +5 trivializes targets; rewarding a miss makes All-in spam dominant). The cleaner economy/defense pieces above cover the same design space.
- **Expansion Pack (6th slot):** breaks the 5-slot constraint the entire difficulty curve is balanced against, and needs new cap machinery. The 5-slot cap *is* the meta tension.
- **Open Book (hints):** needs runtime hint generation + a pre-bet opt-in UI not expressible in the hook system; high content cost for a variance-reduction effect.
- **Counter-Spy / Contrarian-Legendary (modifier-negation):** blocked on the modifier subsystem and, as a per-correct point engine, ceiling-breaking. Defer until modifiers ship; if revived, make the bonus per-*round* (cap +3), not per-correct.

**Shop rarity mix** so they don't all appear at once: 6 common, 5 uncommon, 4 rare, 1 legendary (plus the existing 9). This keeps `rollShop` honest and the legendary genuinely rare.

---

## 4. Implementation checklist

Ordered to keep the build runnable at each step. **Release in two patches** to avoid double-taxing the player.

### Patch A — curve, hook plumbing, compounding jokers

**`engine.js`**
1. Replace `ROUNDS` (lines 37-46) with the §1.2 array (add `mod` strings + a `modData` lookup, but you may leave `mod` unused until step 6).
2. Add `fireHook(run, name, ctx)` dispatcher (§1.3). Refactor `resolve()` to: seed base bet effects (lines 108-114), set `ctx.roundPoints`/`ctx.cfg`, then call `fireHook(run, correct ? 'onCorrect':'onWrong', ctx)`; keep the streak update after.
3. Change every hook invocation to `fn(ctx, j)` (instance passed). Verify the 9 existing jokers still pass (they ignore arg 2).
4. Export `fireRound(run, name, extra)` helper for lifecycle hooks (sets `ctx.cleared`, `ctx.run`, merges `extra`).

**`jokers.js`**
5. Add the 15 new `defs` from §3 (with `initState`, `scaling`, `ruCompatible` fields). Keep `JOKERS = defs.map(j => ({...j, price: PRICE[j.rarity]}))`.

**`+page.svelte`**
6. `buy()` (line 169-174): clone-and-init — `const inst = {...j, state: j.initState ? j.initState() : undefined}; run.jokers = [...run.jokers, inst];`.
7. `startRound()` (line 86): after `run.roundFlags = {}`, call `fireRound(run, 'onRoundStart', { life: 0 })` and apply its `ctx.life` delta to `lives` (so Field Medic's bonus lands *after* base `ROUNDS[idx].lives`).
8. `clearRound()` (line 150): before computing reward, `fireRound(run, 'onRoundEnd', { cleared: true })` and apply `ctx.money`. In `gameOver()`, `fireRound(run, 'onRoundEnd', { cleared: false })`.
9. RU shop filter: in `rollShop`/offer render, drop jokers with `ruCompatible === false` when `lang === 'ru'` (hides Specialist).
10. Add live-state badges on joker chips/cards for `avalanche` (`snow`), `library_card` (`tier`), `momentum_engine` (`charges`) so charge-and-discharge decisions are visible.

### Patch B — modifiers + economy sink (after win-rate telemetry)

**`engine.js`**
11. Add the `MODIFIERS` map (§1.3) keyed by `ROUNDS[idx].mod`; add `activeMods(run)` returning `[MODIFIERS[ROUNDS[run.roundIdx].mod]]` (filtered/substituted when `lang==='ru'`). Make `fireHook` iterate modifiers before jokers and skip `run.roundFlags.jammedIds`.
12. `dealRound()` (line 76): handle `lockCategory` (Specialist) and `forceHardFirst` (Brutal Curve) from `cfg.modData`, with a guard that the chosen category has ≥5 fresh questions.
13. `roundReward()` (line 131): switch to `BASE_BY_ROUND`/`INTEREST_CAP` arrays; honor `dry_spell` (`overfill = 0`). Add `upkeepCost(run)` (`UPKEEP_RATE[roundIdx] * jokers.length`).
14. Add `jokerPrice(run, j)` and update `rerollCost(run)` per §1.4.

**`+page.svelte`**
15. Boss banner: on `startRound()`, read `cfg.modData` and render `name`/`desc` above the question panel.
16. Bet gating: filter `betKeys` against `cfg.modData?.lockBets`; in `resetQuestion()`, default `bet` to the first unlocked key (`double` for The Wall, `allin` for Sudden Death).
17. Shop entry: in `clearRound()`, after reward, `const up = upkeepCost(run); run.money -= up;` show an "Operating Cost −$X (N jokers)" line; if `run.money < 0`, block `nextRound()` and force a sell. Use `jokerPrice`/`rerollCost` for displayed prices and `disabled` checks (lines 323, 333).
18. Dry Spell soft-cap: pass `ctx.roundPoints` into `resolve()` so the modifier's `onCorrect` can zero gains past target.

### Tuning loop
19. Instrument per-round clear rate; aim for a descending curve (~r4 70%, r6 55%, r7 45%, r8 30% of *reached* attempts). Adjust *which modifiers stack* and the economy arrays before touching targets. If win-rate craters, relax the interest cap first (least visible), then drop the boss upkeep rate from 3 to 2, then reconsider Sudden Death.

**Net effect:** later rounds clearly outpace a passive all-Safe build (passive margin goes negative by round 3-4), while a player who bets aggressively *and* owns one or two compounding jokers stays viable to a razor-thin boss — the productive gap, achieved without exponential targets and with full RU parity on every bet-, streak-, money-, and round-keyed mechanic.