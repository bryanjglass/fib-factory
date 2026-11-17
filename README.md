# Fib Factory 🏭

A browser-based multiplayer bluffing party game for family game night (ages ~9 to adult).

Everyone reads a weird-but-true fact with a word missing, secretly writes a **fib** that sounds
like the real answer, then votes for the answer they think is the **truth**. You score by spotting
the truth and by fooling everyone else with your fib.

- **Host controller**: a desktop Chrome tab that creates the game and runs the show.
- **TV display**: a second tab you cast to the television. QR code, questions, timers, reveals, scoreboards.
- **Player controllers**: everyone's phones. No app, no account. Scan the QR code or type the room code.

---

## How to play

1. **Host:** open the site on a computer and click **Create game**. Click **Open TV display**, then cast that
   tab to the TV (Chrome menu **⋮ → Cast… → Cast tab**).
2. **Players (3–10):** scan the QR code on the TV, or go to the site and enter the 4-letter room code.
   Type a name and you're in.
3. **Host:** pick 5, 7 or 10 questions and the timers, then press **Start game**.
4. Each question:
   - **Question:** the TV shows the fact with a blank.
   - **Fib:** everyone types a fake answer on their phone. Make it believable!
   - **Vote:** all the fibs plus the real answer appear in the same shuffled order on every screen.
     Pick the one you think is true. You can't vote for your own fib, and votes are final.
   - **Reveal:** the TV goes through the fibs that fooled people, stamps who wrote them, and then shows the truth.
   - **Scoreboard:** standings, the round's biggest bluff, and the "truth detectors".
5. After the last question the TV crowns a champion and hands out awards (Master Manipulator, Human Fact
   Checker, Professional Believer, Fib of the Night). The host can start a **rematch** with the same players.

### Scoring

| Event | Points |
| --- | --- |
| You vote for the real answer | **+1,000** |
| Each opponent who votes for your fib | **+500** |
| Voting for a fib | 0 |
| Not submitting a fib / not voting | 0 for that part |

Example: Abby's fib fools Owen and Dad (+1,000), and Abby also finds the truth (+1,000) → **+2,000**.
Tied scores share a rank (1, 2, 2, 4).

---

## Architecture

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Host (Chrome)│   │  TV (Chrome) │   │ Phones (×3–10)│      React + Zustand + Tailwind
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘      static site on GitHub Pages
       │  WebSocket (typed JSON messages: actions in, redacted snapshots out)
       └──────────────────┼──────────────────┘
                 ┌────────▼─────────┐
                 │ Cloudflare Worker │  POST /api/rooms · GET /api/rooms/:code · /ws upgrade
                 └────────┬─────────┘
                 ┌────────▼─────────────────────────────┐
                 │ Durable Object "FibRoom" (1 per room) │  authoritative state, timers (alarms),
                 │  RoomController → pure game engine    │  persistence, WebSocket hibernation
                 └──────────────────────────────────────┘
```

### Repository layout

| Path | What lives there |
| --- | --- |
| `shared/` | Wire protocol types (`protocol.ts`), constants, text normalization, player palette. Safe for browsers. |
| `server/engine/` | **Pure game logic.** No I/O. `game.ts` (state machine), `scoring.ts`, `standings.ts` (ranks, highlights, awards), `views.ts` (per-viewer redacted snapshots), `random.ts`. |
| `server/room/controller.ts` | `RoomController`: message handling, auth, presence, persistence and alarm scheduling, written against small interfaces (storage, connections, clock, RNG). |
| `server/room/durable-object.ts` | Thin Cloudflare adapter: Hibernation WebSockets, DO storage and alarms. |
| `server/index.ts` | Worker routes, room-code allocation, CORS/origin checks. |
| `server/questions.ts` | The question bank (65 questions). **Server-only.** |
| `client/` | Vite + React app: `views/host`, `views/tv`, `views/player`, `net/connection.ts` (self-healing socket), `store.ts` (Zustand). |
| `tests/unit`, `tests/integration`, `tests/e2e` | Vitest unit and integration tests, plus Playwright end-to-end tests. |

### The game state machine

```
lobby → question → submission → voting → reveal → scoreboard ─┬→ question   (next round)
  ▲                                                            └→ gameOver ── rematch ─┐
  └────────────────────────────────────────────────────────────────────────────────────┘
```

- `question` (6 s intro), `submission` and `voting` (host-configured), and each `reveal` step (4.5 s per fib,
  7 s for the truth) are **timed by the server**. Submission and voting also end early once every *connected*
  contestant has acted.
- `scoreboard → next question` is advanced by the host. The host can also skip any timed phase, pause/resume,
  or return to the lobby.
- Every "Next" press carries the phase/round/step it was meant for (`expect`). A double-click or a retried
  message arriving after the game moved on is rejected (`STALE_ACTION`), so questions can't be skipped by accident.
- Scoring runs exactly once per round, guarded by a `scored` flag, on entry to `reveal`.

### Security and secrecy model

- **Clients send actions, never state.** The Durable Object validates everything: phase, timer, ownership,
  duplicates, and who is allowed to do it.
- **Answers never reach the browser early.** Questions live only in the Worker bundle. `views.ts` is the
  single place that builds snapshots: the answer, which entry is the truth, fib authors and votes are only
  included once the round has been scored. Before that, the ballot is anonymous `{id, text}` pairs.
  Tests check this on the snapshots and on the real WebSocket frames in the E2E suite.
- A fib matching the answer (or a listed equivalent like "3"/"three") is rejected with a deliberately vague message.
- **Tokens:** the host token (256-bit) and player reconnect tokens (192-bit) come from `crypto.getRandomValues`,
  are compared in constant time, and are never included in any snapshot. Room codes are only for finding a room;
  host powers need the host token.
- **Isolation:** each room code maps to its own Durable Object (`idFromName(code)`) with its own storage.
  Tokens from one room mean nothing in another.

### Timers and reliability

- Timer deadlines are stored in Durable Object storage and enforced with a DO **alarm**, so phases advance
  even when nobody is connected and after the object is evicted. On a late wake-up the engine makes exactly
  one transition, and the next phase's timer starts from *now*, so a whole phase can't be skipped.
- Clients render countdowns from the server's `endsAt` plus a measured clock offset, so all screens agree.
- Clients reconnect automatically with backoff, and immediately when a phone wakes up or comes back online.
  They send `hello` with their stored token and get a full snapshot back. Player tokens live in `localStorage`
  per room, so refreshing or reconnecting keeps your seat and score without creating a duplicate player.
- Rooms with no activity for 12 hours delete themselves.

---

## Local development

**Requirements:** Node.js 20+ (22 recommended) and npm. No Cloudflare account is needed locally:
`wrangler dev` runs the Worker and Durable Object on your machine.

```bash
npm install
```

```bash
npm run dev
```

This starts:

- the Worker + Durable Object at `http://127.0.0.1:8787` (`wrangler dev`)
- the frontend at `http://localhost:5173` (Vite), which proxies `/api` (including WebSockets) to the Worker

Open `http://localhost:5173`, click **Create game**, then **Open TV display**.

**Playing with real phones on your Wi-Fi:** open the host page at your computer's LAN address
(for example `http://192.168.1.20:5173`, which Vite prints as "Network") instead of `localhost`. The QR code
uses whatever address the host page was opened with, so phones on the same network can join.

You can also run the two halves separately:

```bash
npm run dev:server
```

```bash
npm run dev:client
```

## Tests

```bash
npm test
```

Runs the Vitest unit and integration suites (≈100 tests, about 1 second). They use a seeded RNG, a fake
clock and fake sockets, so timer tests are deterministic.

```bash
npm run test:e2e
```

Starts `wrangler dev` and Vite on dedicated ports (8799/5179) and runs Playwright. A host, a TV tab and three
phone-sized players play a full 5-question game against the real Durable Object. The run checks exact scores
every round, ballot consistency, secrecy on the raw WebSocket frames, refresh/reconnect of a player, the TV
and the host, game over, awards and rematch. A second test covers timer expiry, pause/resume, a player who
drops mid-round, host authorization and unknown rooms. Takes about 2 minutes. On a fresh machine, install a
browser first with `npx playwright install chromium`.

```bash
npm run typecheck
```

```bash
npm run test:all
```

`test:all` runs the typecheck, the unit and integration suites, and the E2E suite.

| Requirement | Where it's tested |
| --- | --- |
| Game creation & room-code uniqueness | `integration/worker.test.ts`, `integration/room.test.ts` |
| Joining, duplicate names | `unit/game.test.ts`, `integration/room.test.ts`, E2E |
| Not enough players | `unit/game.test.ts`, `integration/room.test.ts`, E2E |
| Valid/invalid transitions | `unit/game.test.ts` (state machine) |
| Submission validation & duplicates | `unit/game.test.ts`, `integration/room.test.ts`, E2E |
| Correct answer secret before reveal | `unit/views.test.ts`, `integration/room.test.ts`, E2E (raw frames) |
| Ballot randomization & consistency | `unit/game.test.ts`, `unit/views.test.ts`, E2E |
| Own-fib votes rejected | `unit/game.test.ts`, `integration/room.test.ts`, E2E |
| Duplicate & late votes | `unit/game.test.ts`, `integration/room.test.ts` |
| Scoring (single/multiple fooled) | `unit/scoring.test.ts`, integration, E2E |
| Idempotent scoring / repeated messages | `unit/game.test.ts`, `integration/room.test.ts` |
| Timer expiry & auto-progression | `unit/game.test.ts`, `integration/room.test.ts`, E2E |
| Incomplete submissions / missing votes | `unit/game.test.ts`, `integration/room.test.ts`, E2E |
| Disconnect & reconnect | `integration/room.test.ts`, E2E |
| Host & display refresh | `integration/room.test.ts`, E2E |
| Room isolation & authorization | `integration/room.test.ts`, `integration/worker.test.ts`, E2E |
| Final rankings & rematch reset | `unit/game.test.ts`, `integration/room.test.ts`, E2E |
| Question bank (≥50, no answer leaks, server-only) | `unit/questions.test.ts` |

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SERVER_URL` | Frontend, **build time** | URL of the deployed Worker, e.g. `https://fib-factory.you.workers.dev`. WebSockets use the matching `wss://` URL. If unset, the app uses its own origin (that's what local dev uses via the Vite proxy). Production builds print a warning when it's missing. |
| `ALLOWED_ORIGINS` | Worker var (`wrangler.jsonc`) | Comma-separated origins allowed to create rooms and open sockets, e.g. `https://you.github.io`. `*` allows any. |
| `FIB_BACKEND_ORIGIN` | Dev only | Where the Vite dev proxy forwards `/api`. Default `http://127.0.0.1:8787`. |
| `E2E_API_PORT`, `E2E_WEB_PORT` | E2E only | Ports used by the Playwright web servers (default 8799 / 5179). |
| `?server=https://…` | Page URL | Runtime override of the backend URL, remembered in `localStorage` and carried into QR codes. Handy for testing a build against a different Worker. |

There are no secrets in the frontend. Nothing needs a database or paid add-on: Durable Objects with
SQLite storage are available on the Workers free plan.

## Production build

```bash
VITE_SERVER_URL=https://fib-factory.<your-subdomain>.workers.dev npm run build
```

The static site is written to `dist/`. It uses a relative base path and hash routes (`#/play/ABCD`), so it
works from any sub-path such as `https://you.github.io/fib-factory/` without server rewrites.

## Deploying the backend (Cloudflare Workers)

1. Log in once:

   ```bash
   npx wrangler login
   ```

2. Optionally, lock the API to your site in `wrangler.jsonc`: `"ALLOWED_ORIGINS": "https://<you>.github.io"`.
3. Deploy:

   ```bash
   npm run deploy:server
   ```

   Wrangler prints the Worker URL, for example `https://fib-factory.<your-subdomain>.workers.dev`.
   The `migrations` entry in `wrangler.jsonc` creates the SQLite-backed `FibRoom` Durable Object class on the
   first deploy.
4. Check that it's up:

   ```bash
   curl https://fib-factory.<your-subdomain>.workers.dev/api/health
   ```

## Deploying the frontend (GitHub Pages)

**Using the included workflow (`.github/workflows/deploy.yml`):**

1. Push this repository to GitHub.
2. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables:** add `VITE_SERVER_URL` set to your Worker URL.
4. Push to `main`, or run the **Deploy** workflow manually. The site appears at
   `https://<you>.github.io/<repo>/`.
5. Optional: to deploy the Worker from CI as well, add the variable `DEPLOY_WORKER=true` and the secrets
   `CLOUDFLARE_API_TOKEN` (with the "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`.

**Manually:** run the production build above and publish `dist/` to any static host. The `gh-pages` branch
works, as do Cloudflare Pages and Netlify.

`.github/workflows/ci.yml` runs the typecheck, the unit and integration tests, and the E2E tests on every
push and pull request.

---

## Design decisions

- **One authoritative reducer, pure and cloned.** Engine functions mutate a `structuredClone` of the state
  and the controller commits only if no `GameError` is thrown, so a rejected action never leaves partial changes.
- **Transport-agnostic controller.** All Durable Object behavior goes through `RoomController`. The
  integration tests drive it with fake sockets, storage, clock and alarms, and the E2E tests cover the real
  Cloudflare runtime.
- **Room codes** are 4 letters from 20 consonants (160,000 codes), which avoids accidental words and
  look-alike characters. Uniqueness is enforced by the Durable Object: `/init` refuses if a live room already
  holds that code, and the Worker retries with a new one.
- **Early completion only counts connected players**, so a phone that dies never holds the room hostage.
  If everyone disconnects, the timer still ends the phase.
- **Duplicate fib detection** ignores case and whitespace, and also punctuation and leading articles
  ("The Moon!" = "moon"), which makes it a little stricter than required. Fibs equal to the truth are checked
  the same way, plus listed equivalents.
- **Late joiners** wait on the sidelines (status `waiting`) and become contestants at the next rematch or
  lobby reset, up to the 10-player cap.
- **The host doesn't play from the controller.** They can join from their phone like anyone else. The host
  controller never shows the answer before the reveal.
- **Reveal pacing is server-driven** (`revealStep` + alarms), so the TV, the phones and the host stay in step.
  The host can speed it up with **Next**.
- **Uppercase answers everywhere** so capitalization can't give the real answer away.
- **Sound** is synthesized with WebAudio (no assets), is optional, and nothing waits on it. Browsers need one
  click on the TV tab to allow audio. **Reduced motion** follows the OS setting by default and can be toggled
  on every screen. It removes non-essential animation, confetti and spotlights.
- **No router or animation libraries.** A tiny hash router and CSS keyframes keep the bundle small (~77 kB gzipped).

## Known limitations

- Room creation isn't rate-limited. Add Cloudflare rate-limiting rules in front of `POST /api/rooms` for a
  public deployment.
- The question bank is fixed at build time (65 questions). Adding more means editing `server/questions.ts`.
  A rematch prefers questions the room hasn't seen yet and cycles once all are used.
- The player reconnect token is stored per browser. Clearing site data, or switching browsers, means joining
  again under a new name (the old seat stays until the host removes it between games).
- One host browser per room: the host token lives in that browser's `localStorage`. Opening the host link
  elsewhere shows a "not the host" screen by design.
- The E2E tests use Chromium with phone emulation. They don't run on real iOS Safari, although the UI uses
  only widely supported features (`dvh` units, WebSocket, WebAudio).
