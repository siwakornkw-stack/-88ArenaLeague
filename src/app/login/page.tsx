"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-xl bg-card border border-white/10 p-8 space-y-5"
      >
        <h1 className="font-display italic font-bold text-2xl text-accent">88ArenaLeague</h1>
        <p className="text-sm text-foreground/60">เข้าสู่ระบบจัดการลีกฟุตบอล</p>

        <div className="space-y-1">
          <label className="text-sm text-foreground/70" htmlFor="email">
            อีเมล
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-foreground outline-none focus:border-accent"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-foreground/70" htmlFor="password">
            รหัสผ่าน
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-foreground outline-none focus:border-accent"
          />
        </div>

        {state.error && <p className="text-sm text-red-400">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-accent text-black font-semibold py-2 disabled:opacity-50"
        >
          {pending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>

        <Link href="/" className="block text-center text-xs text-foreground/50 hover:text-accent">
          ← กลับหน้าแรก
        </Link>
      </form>
    </div>
  );
}
