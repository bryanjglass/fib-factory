import { devices, expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * End-to-end: a host, a TV display and three phones play a complete game
 * against the real Worker + Durable Object (wrangler dev), then rematch.
 */

const PHONE = { ...devices['Pixel 7'] };

interface Seat {
  name: string;
  ctx: BrowserContext;
  page: Page;
  frames: string[];
}

async function createGame(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create game' }).click();
  const code = (await page.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z]{4}$/);
  return code;
}

async function joinPlayer(browser: Browser, code: string, name: string): Promise<Seat> {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  await page.goto(`/#/play/${code}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByTestId('join-button').click();
  await expect(page.getByTestId('my-name')).toHaveText(name);
  return { name, ctx, page, frames };
}

async function submitFib(seat: Seat, text: string) {
  await seat.page.getByTestId('fib-input').fill(text);
  await seat.page.getByTestId('fib-submit').click();
}

/** Vote for the ballot option whose text matches; `null` means "the truth" (the one nobody wrote). */
async function vote(seat: Seat, target: string | null, fibs: string[]) {
  const options = seat.page.getByTestId('ballot-option');
  await expect(options.first()).toBeVisible();
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const text = await options.nth(i).getAttribute('data-text');
    const isTarget = target === null ? !fibs.includes(text!) : text === target;
    if (isTarget) {
      await options.nth(i).click();
      await seat.page.getByTestId('vote-submit').click();
      return;
    }
  }
  throw new Error(`no ballot option for ${target}`);
}

async function phase(tv: Page) {
  return tv.getByTestId('tv').getAttribute('data-phase');
}

async function hostNext(host: Page) {
  await host.getByTestId('host-next').click();
}

test('host, TV and three players complete a full game with correct scores, then rematch', async ({ browser }) => {
  const desk = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const host = await desk.newPage();
  const code = await createGame(host);

  // TV opens from the host controller in a separate tab.
  const [tv] = await Promise.all([desk.waitForEvent('page'), host.getByTestId('open-tv').click()]);
  await expect(tv.getByTestId('tv-room-code')).toHaveText(code);
  await expect(tv.locator('[data-qr-value]')).toHaveAttribute('data-qr-value', new RegExp(`#/play/${code}$`));

  // Not enough players yet.
  await expect(host.getByTestId('start-game')).toBeDisabled();

  const abby = await joinPlayer(browser, code, 'Abby');
  const owen = await joinPlayer(browser, code, 'Owen');

  // Duplicate names are rejected (case-insensitive).
  const dupeCtx = await browser.newContext(PHONE);
  const dupe = await dupeCtx.newPage();
  await dupe.goto(`/#/play/${code}`);
  await dupe.getByLabel('Your name').fill('ABBY');
  await dupe.getByTestId('join-button').click();
  await expect(dupe.getByRole('alert')).toContainText('already called');
  await dupeCtx.close();

  const dad = await joinPlayer(browser, code, 'Dad');
  const seats = [abby, owen, dad];

  // Lobby updates live on the TV.
  await expect(tv.getByTestId('tv-player-count')).toHaveText('3');
  await expect(tv.getByTestId('tv-players')).toContainText('Abby');
  await expect(tv.getByTestId('tv-players')).toContainText('Dad');

  // Phones have no horizontal scrolling.
  for (const s of seats) {
    const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }

  await host.getByTestId('questions-5').click();
  await expect(host.getByTestId('questions-5')).toHaveAttribute('aria-pressed', 'true');
  await host.getByTestId('start-game').click();

  const expected: Record<string, number> = { Abby: 0, Owen: 0, Dad: 0 };
  const seenQuestions = new Set<string>();

  for (let round = 1; round <= 5; round++) {
    await expect(tv.getByTestId('tv')).toHaveAttribute('data-phase', 'question');
    seenQuestions.add((await tv.getByTestId('tv-question').textContent())!);
    await hostNext(host); // skip the intro
    await expect(tv.getByTestId('tv')).toHaveAttribute('data-phase', 'submission');

    const fibs = seats.map((s) => `zq ${s.name} ${round} wobble`);
    await submitFib(abby, fibs[0]!);
    await expect(abby.page.getByTestId('fib-locked')).toBeVisible();
    await expect(tv.getByTestId('tv-submit-count')).toContainText('1');

    if (round === 2) {
      // A player refreshes mid-round: identity and their locked fib are restored.
      await abby.page.reload();
      await expect(abby.page.getByTestId('my-name')).toHaveText('Abby');
      await expect(abby.page.getByTestId('fib-locked')).toContainText(fibs[0]!.toUpperCase(), { ignoreCase: true });
      // Duplicate fib is rejected on the phone.
      await submitFib(owen, fibs[0]!.toUpperCase());
      await expect(owen.page.getByTestId('fib-error')).toContainText('already wrote');
    }

    await submitFib(owen, fibs[1]!);
    await submitFib(dad, fibs[2]!);
    await expect(tv.getByTestId('tv')).toHaveAttribute('data-phase', 'voting');

    // Same ballot order on every screen; the TV shows all fibs + the truth.
    const tvBallot = await tv.getByTestId('tv-ballot').locator('> div').allTextContents();
    expect(tvBallot).toHaveLength(4);
    for (const s of seats) {
      await expect(s.page.getByTestId('ballot-option')).toHaveCount(4);
      const phoneBallot = await s.page.getByTestId('ballot-option').evaluateAll((els) => els.map((e) => e.getAttribute('data-text')));
      expect(phoneBallot.map((t) => t!.toUpperCase())).toEqual(tvBallot.map((t) => t.toUpperCase()));
    }
    // You can't vote for your own fib.
    await expect(abby.page.locator(`[data-testid=ballot-option][data-text="${fibs[0]}"]`)).toBeDisabled();

    if (round === 3) {
      // The TV refreshes mid-vote and comes straight back to the same ballot.
      await tv.reload();
      await expect(tv.getByTestId('tv')).toHaveAttribute('data-phase', 'voting');
      expect(await tv.getByTestId('tv-ballot').locator('> div').allTextContents()).toEqual(tvBallot);
      // The host refreshes and keeps host powers.
      await host.reload();
      await expect(host.getByTestId('host-phase')).toHaveText('Voting');
    }

    if (round % 2 === 1) {
      await vote(abby, null, fibs); // finds the truth
      await vote(owen, fibs[0]!, fibs); // fooled by Abby
      await vote(dad, fibs[0]!, fibs); // fooled by Abby
      expected.Abby! += 2000;
    } else {
      await vote(abby, fibs[1]!, fibs); // fooled by Owen
      await vote(owen, null, fibs);
      await vote(dad, null, fibs);
      expected.Owen! += 1500;
      expected.Dad! += 1000;
    }

    await expect(tv.getByTestId('tv')).toHaveAttribute('data-phase', 'reveal');
    // The reveal walks through the fooling fibs on its own, then the truth.
    await expect(tv.getByTestId('tv-reveal-fib')).toContainText(round % 2 === 1 ? 'Abby' : 'Owen');
    await expect(tv.getByTestId('tv-reveal-truth')).toBeVisible({ timeout: 15_000 });
    const truthText = (await tv.getByTestId('tv-truth').textContent())!.trim();
    expect(fibs.map((f) => f.toUpperCase())).not.toContain(truthText.toUpperCase());

    // Secrecy, checked on the actual WebSocket frames each phone received:
    // nothing before the reveal marks the truth or names authors, and the
    // answer text never appears before the ballot exists.
    for (const s of seats) {
      for (const raw of s.frames) {
        const msg = JSON.parse(raw);
        if (msg.type !== 'state') continue;
        const ph = msg.state.phase as string;
        if (!['question', 'submission', 'voting'].includes(ph)) continue;
        expect(raw).not.toContain('truthId');
        expect(raw).not.toContain('isTruth');
        expect(raw).not.toContain('authorIds');
        if (ph !== 'voting') expect(raw.toUpperCase()).not.toContain(`"${truthText.toUpperCase()}"`);
      }
      s.frames.length = 0;
    }

    await expect(host.getByTestId('host-next')).toContainText('Show scores');
    await hostNext(host); // → scoreboard
    await expect(tv.getByTestId('tv')).toHaveAttribute('data-phase', 'scoreboard');
    for (const [name, score] of Object.entries(expected)) {
      await expect(tv.locator(`[data-testid=tv-score-row][data-player="${name}"]`)).toHaveAttribute('data-score', String(score));
    }
    await expect(abby.page.getByTestId('my-score')).toHaveText(expected.Abby!.toLocaleString('en-US'));

    await hostNext(host); // → next question or game over
  }

  // Game over: final rankings and winner.
  await expect(tv.getByTestId('tv')).toHaveAttribute('data-phase', 'gameOver');
  expect(seenQuestions.size).toBe(5);
  expect(expected).toEqual({ Abby: 6000, Owen: 3000, Dad: 2000 });
  await expect(tv.getByTestId('tv-winner')).toContainText('Abby');
  await expect(tv.getByTestId('tv-winner')).toContainText('6,000');
  const finalRows = await tv.getByTestId('tv-final-standings').locator('li').allTextContents();
  expect(finalRows[0]).toContain('Owen');
  expect(finalRows[1]).toContain('Dad');
  await expect(tv.getByTestId('tv-award').filter({ hasText: 'Master Manipulator' })).toContainText('Abby');
  await expect(tv.getByTestId('tv-award').filter({ hasText: 'Human Fact Checker' })).toBeVisible();
  await expect(abby.page.getByTestId('final-rank')).toHaveText('You win!');
  await expect(dad.page.getByTestId('final-rank')).toHaveText('You finished #3');

  // Rematch: same roster, scores reset, back in the lobby, and a new game can start.
  await host.getByTestId('host-rematch').click();
  await expect(tv.getByTestId('tv')).toHaveAttribute('data-phase', 'lobby');
  await expect(tv.getByTestId('tv-player-count')).toHaveText('3');
  for (const s of seats) await expect(s.page.getByTestId('my-score')).toHaveText('0');
  await host.getByTestId('start-game').click();
  await expect(tv.getByTestId('tv')).toHaveAttribute('data-phase', 'question');
  const firstOfRematch = (await tv.getByTestId('tv-question').textContent())!;
  expect(seenQuestions.has(firstOfRematch)).toBe(false);

  await Promise.all(seats.map((s) => s.ctx.close()));
  await desk.close();
});

test('timers run the game with no host input, and dropped players do not block it', async ({ browser }) => {
  const desk = await browser.newContext();
  const host = await desk.newPage();
  const code = await createGame(host);
  const [tv] = await Promise.all([desk.waitForEvent('page'), host.getByTestId('open-tv').click()]);
  const seats = [
    await joinPlayer(browser, code, 'Ana'),
    await joinPlayer(browser, code, 'Ben'),
    await joinPlayer(browser, code, 'Cy'),
  ];
  await host.getByTestId('submit-seconds').selectOption('20');
  await host.getByTestId('vote-seconds').selectOption('15');
  await host.getByTestId('start-game').click();

  // Question intro times out by itself.
  await expect(tv.getByTestId('tv')).toHaveAttribute('data-phase', 'submission', { timeout: 12_000 });
  await submitFib(seats[0]!, 'zq lonely fib');
  // Cy's phone disconnects completely.
  await seats[2]!.ctx.close();
  await expect(host.getByTestId('host-players')).toContainText('offline');

  // Pause freezes the timer; resume continues.
  await host.getByTestId('host-pause').click();
  await expect(tv.getByText('PAUSED')).toBeVisible();
  await tv.waitForTimeout(1500);
  expect(await phase(tv)).toBe('submission');
  await host.getByTestId('host-resume').click();

  // Ben never submits; the timer ends the phase anyway.
  await expect(tv.getByTestId('tv')).toHaveAttribute('data-phase', 'voting', { timeout: 30_000 });
  await expect(seats[1]!.page.getByTestId('ballot-option')).toHaveCount(2);
  // Ben (no fib) can still vote.
  await vote(seats[1]!, 'zq lonely fib', []);
  await expect(seats[1]!.page.getByTestId('vote-locked')).toBeVisible();
  // Ana never votes; voting times out and the reveal starts.
  await expect(tv.getByTestId('tv')).toHaveAttribute('data-phase', 'reveal', { timeout: 25_000 });
  await expect(tv.getByTestId('tv-reveal-fib')).toContainText('Ana');
  await expect(tv.getByTestId('tv-fib-points')).toHaveText('+500');
  // The reveal advances itself to the scoreboard.
  await expect(tv.getByTestId('tv')).toHaveAttribute('data-phase', 'scoreboard', { timeout: 20_000 });
  await expect(tv.locator('[data-testid=tv-score-row][data-player="Ana"]')).toHaveAttribute('data-score', '500');
  await expect(tv.locator('[data-testid=tv-score-row][data-player="Ben"]')).toHaveAttribute('data-score', '0');

  // No host input needed: the scoreboard counts down and the next question starts by itself.
  await expect(tv.getByTestId('tv-next-countdown')).toContainText('Next question in');
  await expect(tv.getByTestId('tv')).toHaveAttribute('data-phase', 'question', { timeout: 15_000 });
  await expect(host.getByTestId('host-phase')).toHaveText('Question intro');
  await expect(tv.getByTestId('tv-question')).toBeVisible();

  // Reduced motion can be switched on from the TV and is remembered after a refresh.
  await tv.getByRole('button', { name: /Motion: on/ }).click();
  await expect(tv.locator('html')).toHaveClass(/reduce-motion/);
  await tv.reload();
  await expect(tv.locator('html')).toHaveClass(/reduce-motion/);
  await expect(tv.getByTestId('tv')).toBeVisible();

  // Another browser cannot take over host controls.
  const intruder = await browser.newContext();
  const ip = await intruder.newPage();
  await ip.goto(`/#/host/${code}`);
  await expect(ip.getByText("This browser isn't the host")).toBeVisible();
  await intruder.close();

  // Unknown rooms are reported nicely.
  const lost = await browser.newContext(PHONE);
  const lp = await lost.newPage();
  await lp.goto('/');
  await lp.getByLabel('Room code').fill('ZZZZ');
  await lp.getByRole('button', { name: 'Join' }).click();
  await expect(lp.getByRole('alert')).toContainText('No game found');
  await lost.close();

  await Promise.all(seats.slice(0, 2).map((s) => s.ctx.close()));
  await desk.close();
});
