import Link from "next/link";
import type { SessionPayload } from "@/lib/auth";
import { logout } from "@/app/login/actions";

const NAV_BY_ROLE: Record<SessionPayload["role"], { href: string; label: string }[]> = {
  SUPER_ADMIN: [
    { href: "/dashboard", label: "ภาพรวม" },
    { href: "/admin/logs", label: "ประวัติระบบ" },
    { href: "/account", label: "บัญชี" },
    { href: "/", label: "ดูเว็บสาธารณะ" },
  ],
  TEAM_MANAGER: [
    { href: "/teams/mine", label: "ทีมของฉัน" },
    { href: "/account", label: "บัญชี" },
    { href: "/", label: "ดูเว็บสาธารณะ" },
  ],
};

const ROLE_LABEL: Record<SessionPayload["role"], string> = {
  SUPER_ADMIN: "แอดมิน",
  TEAM_MANAGER: "ผู้จัดการทีม",
};

export function Sidebar({
  session,
  liveCount = 0,
}: {
  session: SessionPayload;
  liveCount?: number;
}) {
  const items = NAV_BY_ROLE[session.role];

  return (
    <aside className="w-60 shrink-0 border-r border-white/10 bg-card flex flex-col">
      <div className="px-5 py-6">
        <span className="font-display italic font-bold text-xl text-accent">88ArenaLeague</span>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-md px-3 py-2 text-sm text-foreground/80 hover:bg-white/5 hover:text-foreground"
          >
            {item.label}
            {item.href === "/dashboard" && liveCount > 0 && (
              <span className="ml-2 rounded-full bg-red-500/15 text-red-400 px-2 py-0.5 text-[10px]">
                ● {liveCount} สด
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-white/10">
        <p className="text-sm text-foreground">{session.name}</p>
        <p className="text-xs text-foreground/50">{ROLE_LABEL[session.role]}</p>
        <form action={logout} className="mt-3">
          <button type="submit" className="text-xs text-foreground/60 hover:text-accent">
            ออกจากระบบ
          </button>
        </form>
      </div>
    </aside>
  );
}
