import Link from "next/link";
import type { SessionPayload } from "@/lib/auth";
import { logout } from "@/app/login/actions";

const NAV_BY_ROLE: Record<SessionPayload["role"], { href: string; label: string; icon: string }[]> = {
  SUPER_ADMIN: [
    { href: "/dashboard", label: "ภาพรวม", icon: "▦" },
    { href: "/admin/logs", label: "ประวัติระบบ", icon: "🕘" },
    { href: "/account", label: "บัญชี", icon: "👤" },
    { href: "/help#admin", label: "วิธีใช้งาน", icon: "📖" },
    { href: "/", label: "ดูเว็บสาธารณะ", icon: "🌐" },
  ],
  TEAM_MANAGER: [
    { href: "/teams/mine", label: "ทีมของฉัน", icon: "👥" },
    { href: "/account", label: "บัญชี", icon: "👤" },
    { href: "/help#manager", label: "วิธีใช้งาน", icon: "📖" },
    { href: "/", label: "ดูเว็บสาธารณะ", icon: "🌐" },
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
      <div className="px-5 py-6 flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-accent grid place-items-center font-display italic font-extrabold text-sm text-black">
          88
        </span>
        <span className="font-display italic font-bold text-lg text-foreground">
          ARENA<span className="text-accent">LEAGUE</span>
        </span>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-foreground/75 hover:bg-white/5 hover:text-foreground hover:border-accent"
          >
            <span className="text-base w-5 text-center">{item.icon}</span>
            {item.label}
            {item.href === "/dashboard" && liveCount > 0 && (
              <span className="ml-auto rounded-full bg-red-500/15 text-red-400 px-2 py-0.5 text-[10px]">
                ● {liveCount} สด
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-white/10 flex items-center gap-3">
        <span className="w-9 h-9 rounded-full bg-[#2E4A22] grid place-items-center font-display font-bold text-sm text-accent shrink-0">
          {session.name.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground truncate">{session.name}</p>
          <p className="text-xs text-foreground/50">{ROLE_LABEL[session.role]}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            title="ออกจากระบบ"
            className="text-foreground/40 hover:text-red-400 text-sm"
          >
            ⎋
          </button>
        </form>
      </div>
    </aside>
  );
}
