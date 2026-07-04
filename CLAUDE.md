@AGENTS.md

# 88ArenaLeague (ระบบจัดการลีกฟุตบอล)

Thai-language football league management app, branded **88ArenaLeague**. Round-robin scheduling only, standings computed on the fly (no stored table).

## Stack

- Next.js 16.2.10 App Router, Server Actions (`"use server"`), async `params`/`searchParams`
- Prisma 7.8.0, `"prisma-client"` generator, custom output at `src/generated/prisma` — always import from `@/generated/prisma/client`, never `@prisma/client`
- Postgres via Neon (`@prisma/adapter-neon` + `@neondatabase/serverless`), driver adapter required — no implicit `DATABASE_URL` connection. See `src/lib/db.ts`
- `src/proxy.ts` — this is middleware, renamed for Next.js 16 (`middleware.ts` no longer works)
- Tailwind v4, dark theme, lime accent (`#D4FF3A`)

## Conventions

- All mutations are plain `<form action={serverAction}>` — no client components, no `onChange`/`fetch` calls. Server Components can't have event handlers.
- Every TEAM_MANAGER action re-checks ownership server-side (team/player/match belongs to `session.userId`) before mutating — see `src/app/(app)/teams/mine/actions.ts` for the pattern.
- Roles: `SUPER_ADMIN` (manage all leagues) vs `TEAM_MANAGER` (own team only, redirected to `/teams/mine`).
- UI copy is Thai. Code, comments, commit messages stay English.
- Same "computed on the fly" rule applies to the live match clock: `Match.minute` is only written once, at `endMatch` (final length). While `status === "LIVE"`, the displayed minute is derived from the `KICK_OFF` event's `createdAt` via `computeLiveMinute()` in `src/lib/matchClock.ts` — never read `match.minute` directly for a live match.
- Both `/matches/[id]` and `/admin/matches/[id]` render the event timeline via the shared `src/components/match-timeline.tsx`, which splits events by `MatchEvent.side` (HOME left / AWAY right / NEUTRAL centered) — KICK_OFF/HALF_TIME/FULL_TIME are NEUTRAL.

## Routing

Two route groups share the root layout — same URL space, so paths must never collide between them:

- `(public)` — no auth, no auth check in code. Serves `/`, `/leagues` (all-leagues index), `/leagues/[id]` (standings/fixtures/top scorers/teams/discipline tabs), `/leagues/[id]/teams/[teamId]` (team profile: roster stats, results, fixtures), `/leagues/[id]/players/[playerId]` (player profile: totals, event log), `/matches/[id]` (read-only scoreboard/stats/timeline/lineups/head-to-head). Entry point for anonymous visitors.
- `(app)` — gated by `src/proxy.ts` (redirects to `/login` if no session). Admin/management pages live under `/admin/leagues/[id]` (schedule generation, standings), `/admin/leagues/[id]/teams` (team/manager CRUD), and `/admin/matches/[id]` (kickoff/goals/cards/stats entry), plus `/dashboard` (SUPER_ADMIN), `/teams/mine` (TEAM_MANAGER), and `/account` (change password, any role).

`src/proxy.ts` matcher: `/dashboard/:path*`, `/admin/:path*`, `/teams/:path*`, `/account/:path*`, `/login`. Anything not matched (including `/leagues/*` and `/matches/*`) is public by default.

## Commands

```
npm run dev
npx prisma migrate dev --name <name>
npx prisma db seed
npx tsc --noEmit
```

## Env vars (`.env`)

- `DATABASE_URL` — Neon pooled connection string
- `DATABASE_URL_UNPOOLED` — direct connection, used for migrations
- `AUTH_SECRET` — JWT signing secret

## Deploy

Git: `https://github.com/siwakornkw-stack/-88ArenaLeague.git`, branch `main`.

Vercel project `league-manager-app`, scope `siwakornkw-stacks-projects`, aliased at `league-manager-app.vercel.app`. DB is Neon, provisioned via Vercel Marketplace — env vars already synced to all three Vercel environments.

`npx prisma db seed` (`prisma/seed.ts`) is destructive: it wipes all league/team/player/match/event/lineup rows (users are kept, upserted) then rebuilds a deterministic demo dataset via a seeded PRNG — 4 leagues, played + live + scheduled rounds, goal/card events, lineups, injured/banned player statuses, and venues. `DATABASE_URL` is the same Neon DB used by prod, so seeding overwrites production league data.

Seeding requires `SEED_ADMIN_PASSWORD` and `SEED_MANAGER_PASSWORD` in the environment (never commit real credentials); it upserts `admin@leaguehub.dev` (SUPER_ADMIN) and `manager@leaguehub.dev` (TEAM_MANAGER) with those passwords. `prisma/rotate-creds.ts` rotates just those two accounts' passwords without wiping league data.
