@AGENTS.md

# League Manager (ระบบจัดการลีกฟุตบอล)

Thai-language football league management app. Round-robin scheduling only, standings computed on the fly (no stored table).

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

Vercel project `league-manager-app`, scope `siwakornkw-stacks-projects`, aliased at `league-manager-app.vercel.app`. DB is Neon, provisioned via Vercel Marketplace — env vars already synced to all three Vercel environments.

Seed accounts: `admin@leaguehub.dev` / `admin1234` (SUPER_ADMIN), `manager@leaguehub.dev` / `manager1234` (TEAM_MANAGER).
