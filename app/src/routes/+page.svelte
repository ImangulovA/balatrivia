<script>
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { norm, sha256 } from '$lib/norm.js';
  import {
    newRun, dealRound, resolve, roundReward, rollShop, rerollCost, loadPool,
    BETS, ROUNDS, MAX_JOKERS, sellValue, LANGS
  } from '$lib/engine.js';
  import { RARITY } from '$lib/jokers.js';

  // ---- state ----
  let view = $state('menu'); // menu | game | shop | gameover | win
  let run = $state(null);
  let roundQs = $state([]);
  let qIdx = $state(0);
  let points = $state(0);
  let lives = $state(0);
  let bet = $state('safe');
  let guess = $state('');
  let revealed = $state(false);
  let lastCorrect = $state(false);
  let lastCtx = $state(null);
  let retryUsed = $state(false);
  let feedback = $state('');
  let revealAnswer = $state('');
  let revealComment = $state('');
  let shopOffer = $state([]);
  let lastReward = $state(null);
  let best = $state(0);
  let theme = $state('dark');
  let shaking = $state(false);
  let lang = $state('en');
  let loadError = $state('');

  // ---- derived ----
  const cfg = $derived(run ? ROUNDS[run.roundIdx] : null);
  const q = $derived(roundQs[qIdx] || null);
  const hasRetry = $derived(!!run && run.jokers.some((j) => j.grantsRetry));
  const betKeys = ['safe', 'double', 'allin'];

  onMount(() => {
    if (browser) {
      theme = localStorage.getItem('balatrivia_theme') || 'dark';
      document.documentElement.dataset.theme = theme;
      best = Number(localStorage.getItem('balatrivia_best') || 0);
    }
  });

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    if (browser) {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem('balatrivia_theme', theme);
    }
  }

  function saveBest(cleared) {
    if (cleared > best) {
      best = cleared;
      if (browser) localStorage.setItem('balatrivia_best', String(best));
    }
  }

  function b64decode(s) {
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  // ---- run flow ----
  async function startRun(l) {
    if (l) lang = l;
    loadError = '';
    view = 'loading';
    try {
      await loadPool(lang);
    } catch (e) {
      loadError = 'Could not load questions. Check your connection and retry.';
      view = 'menu';
      return;
    }
    run = newRun();
    startRound();
  }

  function startRound() {
    run.roundFlags = {};
    run.streak = 0;
    roundQs = dealRound(run);
    qIdx = 0;
    points = 0;
    lives = ROUNDS[run.roundIdx].lives;
    resetQuestion();
    view = 'game';
  }

  function resetQuestion() {
    bet = 'safe';
    guess = '';
    revealed = false;
    retryUsed = false;
    feedback = '';
    revealAnswer = '';
    revealComment = '';
  }

  async function submit() {
    if (revealed || !q) return;
    const g = norm(guess);
    if (!g) return;
    const h = await sha256(g);
    const correct = q.accept.includes(h);
    if (!correct && hasRetry && !retryUsed) {
      retryUsed = true;
      feedback = 'Not quite -- Second Chance gives you one more try.';
      guess = '';
      shaking = false;
      requestAnimationFrame(() => (shaking = true));
      return;
    }
    finishQuestion(correct);
  }

  function finishQuestion(correct) {
    lastCtx = resolve(run, q, BETS[bet], correct);
    points += lastCtx.points;
    lives += lastCtx.life;
    run.money += lastCtx.money;
    lastCorrect = correct;
    revealAnswer = b64decode(q.reveal);
    revealComment = q.comment ? b64decode(q.comment) : '';
    revealed = true;
    feedback = correct ? 'Correct!' : 'Wrong.';
  }

  function next() {
    if (lives < 0) return gameOver();
    if (points >= cfg.target) return clearRound();
    if (lastCtx && lastCtx.endRound) return gameOver(); // all-in miss, short of target
    qIdx += 1;
    if (qIdx >= roundQs.length) return gameOver(); // ran out, short of target
    resetQuestion();
  }

  function clearRound() {
    lastReward = roundReward(run, Math.max(0, lives), points, cfg.target);
    run.money += lastReward.total;
    if (run.roundIdx >= ROUNDS.length - 1) {
      saveBest(ROUNDS.length);
      view = 'win';
      return;
    }
    run.rerollCount = 0;
    shopOffer = rollShop(run);
    view = 'shop';
  }

  function gameOver() {
    saveBest(run.roundIdx); // rounds fully cleared before this one
    view = 'gameover';
  }

  // ---- shop ----
  function buy(j) {
    if (run.money < j.price || run.jokers.length >= MAX_JOKERS) return;
    run.money -= j.price;
    run.jokers = [...run.jokers, j];
    shopOffer = shopOffer.filter((x) => x.id !== j.id);
  }
  function sell(j) {
    run.money += sellValue(j);
    run.jokers = run.jokers.filter((x) => x.id !== j.id);
  }
  function reroll() {
    const c = rerollCost(run);
    if (run.money < c) return;
    run.money -= c;
    run.rerollCount += 1;
    shopOffer = rollShop(run);
  }
  function nextRound() {
    run.roundIdx += 1;
    startRound();
  }

  function onKey(e) {
    if (e.key !== 'Enter') return;
    if (view === 'game') {
      if (revealed) next();
      else submit();
    }
  }
</script>

<svelte:window on:keydown={onKey} />

<div class="wrap">
  <header>
    <div class="logo">BALA<span>TRIVIA</span></div>
    <button class="ghost" onclick={toggleTheme} aria-label="theme">{theme === 'dark' ? '☀' : '☾'}</button>
  </header>

  {#if view === 'menu'}
    <section class="panel center">
      <h1>Roguelike trivia, Balatro-style.</h1>
      <p class="muted">Answer questions, place bets, build a deck of jokers between rounds. Clear all 8 rounds.</p>
      <div class="langpick">
        <button class="primary big" onclick={() => startRun('en')}>Play — English</button>
        <button class="primary big ru" onclick={() => startRun('ru')}>Играть — Русский (ЧГК)</button>
      </div>
      {#if loadError}<p class="fb bad">{loadError}</p>{/if}
      {#if best > 0}<p class="muted small">Best: {best}/8 rounds cleared</p>{/if}
      <p class="muted small src">EN: Open Trivia Database (CC BY-SA 4.0) · RU: ЧГК packs (rating.chgk.info)</p>
    </section>

  {:else if view === 'loading'}
    <section class="panel center">
      <h1>Loading questions…</h1>
      <p class="muted">{LANGS[lang]}{lang === 'ru' ? ' — большой пакет, секунду' : ''}</p>
    </section>

  {:else if view === 'game'}
    <div class="hud">
      <div class="stat"><span class="k">Round</span><span class="v">{run.roundIdx + 1}/8</span></div>
      <div class="stat"><span class="k">Score</span><span class="v">{points}/{cfg.target}</span></div>
      <div class="stat"><span class="k">Lives</span><span class="v lives">{lives > 0 ? '♥'.repeat(lives) : '☠'}</span></div>
      <div class="stat"><span class="k">Money</span><span class="v money">${run.money}</span></div>
      <div class="stat"><span class="k">Streak</span><span class="v">{run.streak}×</span></div>
    </div>

    {#if run.jokers.length}
      <div class="jokerbar">
        {#each run.jokers as j}
          <span class="jchip" style="--c:{RARITY[j.rarity].color}" title={j.desc}>{j.name}</span>
        {/each}
      </div>
    {/if}

    <section class="panel">
      <div class="qmeta">
        <span class="cat">{q.category}</span>
        <span class="diff diff-{q.difficulty}">{q.difficulty}</span>
        <span class="qnum">Q{qIdx + 1}/{roundQs.length}</span>
      </div>
      <p class="clue">{q.question}</p>

      {#if !revealed}
        <div class="bets">
          {#each betKeys as bk}
            <button class="betbtn {bet === bk ? 'sel' : ''}" onclick={() => (bet = bk)}>
              <span class="bl">{BETS[bk].label}</span>
              <span class="bb">{BETS[bk].blurb}</span>
            </button>
          {/each}
        </div>
        <div class="answerrow {shaking ? 'shake' : ''}">
          <!-- svelte-ignore a11y_autofocus -->
          <input
            type="text"
            placeholder="Type your answer..."
            bind:value={guess}
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            autofocus
          />
          <button class="primary" onclick={submit}>Submit</button>
        </div>
        {#if feedback}<p class="fb bad">{feedback}</p>{/if}
        <p class="hint muted small">One attempt. Bet chosen: <b>{BETS[bet].label}</b></p>
      {:else}
        <div class="result {lastCorrect ? 'good' : 'bad'}">
          <div class="rtag">{lastCorrect ? '✓ Correct' : '✗ Wrong'}</div>
          <div class="ranswer">Answer: <b>{revealAnswer}</b></div>
          {#if revealComment}<div class="rcomment">{revealComment}</div>{/if}
          <div class="rdeltas">
            {#if lastCtx.points}<span class="d good">+{lastCtx.points} pt</span>{/if}
            {#if lastCtx.money}<span class="d money">+${lastCtx.money}</span>{/if}
            {#if lastCtx.life}<span class="d bad">{lastCtx.life} life</span>{/if}
            {#if lastCtx.endRound}<span class="d bad">round ends</span>{/if}
          </div>
          <button class="primary" onclick={next}>Continue →</button>
        </div>
      {/if}
    </section>

  {:else if view === 'shop'}
    <section class="panel">
      <div class="shophead">
        <h2>Shop</h2>
        <div class="money big">${run.money}</div>
      </div>
      {#if lastReward}
        <p class="muted small reward">
          Round cleared: base ${lastReward.base} + lives ${lastReward.lifeBonus}
          + overfill ${lastReward.overfill} + interest ${lastReward.interest}
          = <b>+${lastReward.total}</b>
        </p>
      {/if}

      <h3>Jokers for sale</h3>
      <div class="offer">
        {#each shopOffer as j}
          <div class="jcard" style="--c:{RARITY[j.rarity].color}">
            <div class="jtop"><span class="jname">{j.name}</span><span class="jrar">{RARITY[j.rarity].label}</span></div>
            <p class="jdesc">{j.desc}</p>
            <button
              class="buy"
              disabled={run.money < j.price || run.jokers.length >= MAX_JOKERS}
              onclick={() => buy(j)}
            >Buy ${j.price}</button>
          </div>
        {/each}
        {#if shopOffer.length === 0}<p class="muted">Sold out. Reroll or move on.</p>{/if}
      </div>

      <div class="shopactions">
        <button class="ghost" onclick={reroll} disabled={run.money < rerollCost(run)}>
          Reroll (${rerollCost(run)})
        </button>
        <button class="primary" onclick={nextRound}>Next Round →</button>
      </div>

      <h3>Your jokers ({run.jokers.length}/{MAX_JOKERS})</h3>
      <div class="owned">
        {#each run.jokers as j}
          <div class="jcard owned" style="--c:{RARITY[j.rarity].color}">
            <div class="jtop"><span class="jname">{j.name}</span><span class="jrar">{RARITY[j.rarity].label}</span></div>
            <p class="jdesc">{j.desc}</p>
            <button class="sell" onclick={() => sell(j)}>Sell ${sellValue(j)}</button>
          </div>
        {/each}
        {#if run.jokers.length === 0}<p class="muted">No jokers yet. Buy some above.</p>{/if}
      </div>
    </section>

  {:else if view === 'gameover'}
    <section class="panel center">
      <h1 class="lose">Run over</h1>
      <p class="muted">You cleared <b>{run.roundIdx}</b> of 8 rounds.</p>
      <p class="muted small">Best: {best}/8</p>
      <button class="primary big" onclick={() => startRun(lang)}>New Run</button>
      <button class="ghost" onclick={() => (view = 'menu')}>Menu</button>
    </section>

  {:else if view === 'win'}
    <section class="panel center">
      <h1 class="winh">You beat all 8 rounds! 🎰</h1>
      <p class="muted">Banked ${run.money} with {run.jokers.length} jokers.</p>
      <button class="primary big" onclick={() => startRun(lang)}>Play Again</button>
      <button class="ghost" onclick={() => (view = 'menu')}>Menu</button>
    </section>
  {/if}
</div>

<style>
  .wrap { max-width: 720px; margin: 0 auto; padding: 16px; min-height: 100vh; }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
  .logo { font-weight: 800; letter-spacing: 1px; font-size: 22px; }
  .logo span { color: var(--purple); }
  .panel { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 22px; }
  .panel.center { text-align: center; }
  h1 { font-size: 28px; margin: 8px 0 12px; }
  h2 { margin: 0; }
  h3 { margin: 22px 0 10px; color: var(--muted); font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
  .muted { color: var(--muted); }
  .small { font-size: 13px; }
  .src { margin-top: 24px; opacity: .7; }
  .langpick { display: flex; flex-direction: column; gap: 10px; max-width: 380px; margin: 14px auto 0; }
  .langpick .big { margin-top: 0; }
  .primary.ru { background: var(--purple); }
  .rcomment { font-size: 13px; color: var(--muted); line-height: 1.5; background: var(--card2); border-radius: 10px; padding: 10px 12px; margin: 0 auto 14px; max-width: 560px; text-align: left; }

  button.primary { background: var(--accent); color: #fff; border: none; padding: 11px 18px; border-radius: 10px; font-weight: 700; font-size: 15px; }
  button.primary:hover { filter: brightness(1.08); }
  button.primary:disabled { opacity: .4; cursor: not-allowed; }
  button.big { font-size: 18px; padding: 14px 28px; margin-top: 10px; }
  button.ghost { background: transparent; color: var(--text); border: 1px solid var(--line); padding: 10px 16px; border-radius: 10px; font-weight: 600; }
  button.ghost:disabled { opacity: .4; cursor: not-allowed; }

  .hud { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .stat { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; display: flex; flex-direction: column; min-width: 64px; }
  .stat .k { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); }
  .stat .v { font-weight: 800; font-size: 17px; }
  .v.money, .money { color: var(--green); }
  .v.lives { color: var(--red); letter-spacing: 1px; }

  .jokerbar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .jchip { background: var(--card2); border: 1px solid var(--c); color: var(--text); border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 600; }

  .qmeta { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
  .cat { background: var(--card2); padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; }
  .diff { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; padding: 3px 8px; border-radius: 6px; font-weight: 700; }
  .diff-easy { background: rgba(2,226,172,.15); color: var(--green); }
  .diff-medium { background: rgba(245,158,11,.15); color: var(--orange); }
  .diff-hard { background: rgba(239,68,68,.15); color: var(--red); }
  .qnum { margin-left: auto; color: var(--muted); font-size: 12px; }
  .clue { font-size: 20px; line-height: 1.4; font-weight: 600; margin: 0 0 20px; }

  .bets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
  .betbtn { background: var(--card2); border: 2px solid var(--line); border-radius: 12px; padding: 10px; text-align: left; color: var(--text); display: flex; flex-direction: column; gap: 4px; }
  .betbtn.sel { border-color: var(--accent); background: rgba(24,119,242,.12); }
  .bl { font-weight: 800; font-size: 15px; }
  .bb { font-size: 11px; color: var(--muted); line-height: 1.3; }

  .answerrow { display: flex; gap: 8px; }
  .answerrow input { flex: 1; background: var(--bg); border: 2px solid var(--line); color: var(--text); border-radius: 10px; padding: 12px 14px; font-size: 16px; }
  .answerrow input:focus { outline: none; border-color: var(--accent); }
  .shake { animation: shake .35s; }
  @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
  .fb { margin: 10px 0 0; font-weight: 600; }
  .fb.bad { color: var(--orange); }
  .hint { margin-top: 10px; }

  .result { text-align: center; padding: 8px 0; }
  .rtag { font-size: 22px; font-weight: 800; margin-bottom: 8px; }
  .result.good .rtag { color: var(--green); }
  .result.bad .rtag { color: var(--red); }
  .ranswer { font-size: 17px; margin-bottom: 12px; }
  .rdeltas { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 16px; }
  .d { padding: 4px 10px; border-radius: 8px; font-weight: 700; font-size: 13px; background: var(--card2); }
  .d.good { color: var(--green); }
  .d.bad { color: var(--red); }
  .d.money { color: var(--green); }

  .shophead { display: flex; justify-content: space-between; align-items: center; }
  .money.big { font-size: 24px; font-weight: 800; }
  .reward { margin: 8px 0 0; }
  .offer, .owned { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
  .jcard { background: var(--card2); border: 1px solid var(--line); border-left: 4px solid var(--c); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; }
  .jtop { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
  .jname { font-weight: 800; font-size: 15px; }
  .jrar { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--c); font-weight: 700; }
  .jdesc { font-size: 12px; color: var(--muted); line-height: 1.4; flex: 1; margin: 8px 0 10px; }
  .buy { background: var(--green); color: #042; border: none; border-radius: 8px; padding: 8px; font-weight: 800; }
  .buy:disabled { opacity: .4; cursor: not-allowed; }
  .sell { background: transparent; border: 1px solid var(--line); color: var(--muted); border-radius: 8px; padding: 7px; font-weight: 700; }
  .shopactions { display: flex; gap: 10px; justify-content: space-between; margin-top: 16px; }

  .lose { color: var(--red); }
  .winh { color: var(--purple); }
</style>
