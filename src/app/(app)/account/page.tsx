import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { changePassword, updateProfile } from "./actions";

const STATUS_MESSAGE: Record<string, { text: string; ok: boolean }> = {
  ok: { text: "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว", ok: true },
  wrong: { text: "รหัสผ่านปัจจุบันไม่ถูกต้อง", ok: false },
  short: { text: "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร", ok: false },
  mismatch: { text: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน", ok: false },
  renamed: { text: "เปลี่ยนชื่อเรียบร้อย (ชื่อในแถบข้างจะอัปเดตเมื่อเข้าสู่ระบบใหม่)", ok: true },
  noname: { text: "กรุณากรอกชื่อ", ok: false },
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { status } = await searchParams;
  const message = status ? STATUS_MESSAGE[status] : null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { managedTeams: { select: { id: true, name: true, leagueId: true } } },
  });
  const [myLogs, myLogCount] =
    session.role === "SUPER_ADMIN"
      ? await Promise.all([
          prisma.adminLog.findMany({
            where: { userId: session.userId },
            orderBy: { createdAt: "desc" },
            take: 10,
          }),
          prisma.adminLog.count({ where: { userId: session.userId } }),
        ])
      : [[], 0];

  const managedTeamIds = user?.managedTeams.map((t) => t.id) ?? [];
  const squadByStatus =
    managedTeamIds.length > 0
      ? await prisma.player.groupBy({
          by: ["status"],
          where: { teamId: { in: managedTeamIds } },
          _count: { _all: true },
        })
      : [];
  const squadCount = (s: (typeof squadByStatus)[number]["status"]) =>
    squadByStatus.find((r) => r.status === s)?._count._all ?? 0;
  const squadTotal = squadByStatus.reduce((sum, r) => sum + r._count._all, 0);

  const memberDays = user
    ? Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000)
    : 0;

  const TENURE_TIERS = [
    { days: 730, label: "สมาชิกระดับตำนาน", emoji: "🏆" },
    { days: 365, label: "สมาชิกอาวุโส", emoji: "🥇" },
    { days: 180, label: "สมาชิกครึ่งปี", emoji: "🥈" },
    { days: 30, label: "สมาชิกใหม่", emoji: "🥉" },
  ] as const;
  const tenureTier = TENURE_TIERS.find((t) => memberDays >= t.days) ?? null;
  const nextTier = [...TENURE_TIERS].reverse().find((t) => t.days > memberDays) ?? null;

  const loginDaysAgo = user?.lastLoginAt
    ? Math.floor((Date.now() - user.lastLoginAt.getTime()) / 86_400_000)
    : null;

  // Feature: security tip based on real lastLoginAt recency (integrity callout).
  const STALE_LOGIN_DAYS = 30;
  const securityTip =
    loginDaysAgo === null
      ? {
          text: "ยังไม่มีบันทึกการเข้าสู่ระบบครั้งก่อน แนะนำให้ตั้งรหัสผ่านที่คาดเดายากและจดจำไว้ให้ดี",
          level: "warn" as const,
        }
      : loginDaysAgo >= STALE_LOGIN_DAYS
        ? {
            text: `เข้าสู่ระบบครั้งก่อนเมื่อ ${loginDaysAgo} วันที่แล้ว หากไม่ได้ใช้งานบ่อย แนะนำให้เปลี่ยนรหัสผ่านเพื่อความปลอดภัย`,
            level: "warn" as const,
          }
        : {
            text: "การเข้าสู่ระบบของคุณเป็นปัจจุบัน ควรเปลี่ยนรหัสผ่านเป็นระยะและไม่ใช้รหัสซ้ำกับบริการอื่น",
            level: "ok" as const,
          };

  // Feature: 7-day activity heat for SUPER_ADMIN (own AdminLog actions per day).
  const HEAT_DAYS = 7;
  const heatStart = new Date();
  heatStart.setHours(0, 0, 0, 0);
  heatStart.setDate(heatStart.getDate() - (HEAT_DAYS - 1));
  const weekLogs =
    session.role === "SUPER_ADMIN"
      ? await prisma.adminLog.findMany({
          where: { userId: session.userId, createdAt: { gte: heatStart } },
          select: { action: true, createdAt: true },
        })
      : [];
  const heatCells = Array.from({ length: HEAT_DAYS }, (_, i) => {
    const day = new Date(heatStart);
    day.setDate(heatStart.getDate() + i);
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const count = weekLogs.filter(
      (l) => l.createdAt >= day && l.createdAt < next
    ).length;
    return { day, count };
  });
  const heatMax = Math.max(1, ...heatCells.map((c) => c.count));
  const weekTotal = weekLogs.length;
  const topAction = Object.entries(
    weekLogs.reduce<Record<string, number>>((acc, l) => {
      acc[l.action] = (acc[l.action] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1])[0] ?? null;

  const nextMatch =
    managedTeamIds.length > 0
      ? await prisma.match.findFirst({
          where: {
            status: { in: ["SCHEDULED", "LIVE"] },
            OR: [
              { homeTeamId: { in: managedTeamIds } },
              { awayTeamId: { in: managedTeamIds } },
            ],
          },
          orderBy: [{ status: "desc" }, { kickoffAt: "asc" }],
          select: {
            id: true,
            kickoffAt: true,
            venue: true,
            status: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        })
      : null;

  return (
    <div className="max-w-sm space-y-6">
      <div>
        <h1 className="font-display font-bold text-3xl">บัญชีของฉัน</h1>
        <p className="text-foreground/60 mt-1">{session.name}</p>
      </div>

      {user && (
        <div className="rounded-lg bg-card border border-white/10 p-5 text-sm space-y-1.5">
          <p>
            <span className="text-foreground/50">อีเมล:</span> {user.email}
          </p>
          <p>
            <span className="text-foreground/50">บทบาท:</span>{" "}
            {user.role === "SUPER_ADMIN" ? "แอดมิน" : "ผู้จัดการทีม"}
          </p>
          {user.managedTeams.length > 0 && (
            <p>
              <span className="text-foreground/50">ทีมที่ดูแล:</span>{" "}
              {user.managedTeams.map((t) => t.name).join(", ")}{" "}
              <a
                href={`/leagues/${user.managedTeams[0].leagueId}/teams/${user.managedTeams[0].id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                ดูหน้าสาธารณะ ↗
              </a>
            </p>
          )}
          <p>
            <span className="text-foreground/50">สมาชิกตั้งแต่:</span>{" "}
            {user.createdAt.toLocaleDateString("th-TH", { dateStyle: "long" })}{" "}
            <span className="text-foreground/40">
              (
              {memberDays >= 365
                ? `${Math.floor(memberDays / 365)} ปี ${memberDays % 365} วัน`
                : `${memberDays} วัน`}
              )
            </span>
          </p>
          {user.lastLoginAt && (
            <p>
              <span className="text-foreground/50">เข้าสู่ระบบล่าสุด:</span>{" "}
              {user.lastLoginAt.toLocaleString("th-TH", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              {loginDaysAgo !== null && (
                <span className="text-foreground/40">
                  {" "}
                  ({loginDaysAgo === 0 ? "วันนี้" : `${loginDaysAgo} วันก่อน`})
                </span>
              )}
            </p>
          )}
          {tenureTier && (
            <div className="pt-1.5 mt-1.5 border-t border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-foreground/50">ระดับสมาชิก:</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                  <span aria-hidden>{tenureTier.emoji}</span>
                  {tenureTier.label}
                </span>
              </div>
              {nextTier && (
                <p className="text-xs text-foreground/40 mt-1.5">
                  อีก {nextTier.days - memberDays} วัน จะได้ระดับ{" "}
                  <span className="text-foreground/60">{nextTier.label}</span> {nextTier.emoji}
                </p>
              )}
            </div>
          )}
          <div className="pt-1.5 mt-1.5 border-t border-white/10 flex items-center gap-2">
            <span className="text-foreground/50">สถานะบัญชี:</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                user.isActive
                  ? "bg-accent/15 text-accent"
                  : "bg-red-400/15 text-red-400"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  user.isActive ? "bg-accent" : "bg-red-400"
                }`}
              />
              {user.isActive ? "ใช้งานอยู่" : "ถูกระงับ"}
            </span>
          </div>
        </div>
      )}

      <div
        className={`rounded-lg border p-5 text-sm flex items-start gap-3 ${
          securityTip.level === "ok"
            ? "bg-accent/5 border-accent/25"
            : "bg-amber-400/5 border-amber-400/25"
        }`}
      >
        <span aria-hidden className="text-lg shrink-0">
          {securityTip.level === "ok" ? "🔒" : "⚠️"}
        </span>
        <div>
          <p
            className={`font-medium ${
              securityTip.level === "ok" ? "text-accent" : "text-amber-400"
            }`}
          >
            คำแนะนำด้านความปลอดภัย
          </p>
          <p className="text-foreground/60 mt-0.5">{securityTip.text}</p>
          <a href="#" className="text-xs text-accent hover:underline mt-1 inline-block">
            เปลี่ยนรหัสผ่านด้านล่าง ↓
          </a>
        </div>
      </div>

      <div className="rounded-lg bg-card border border-white/10 p-5">
        <h2 className="font-semibold mb-3">ทางลัด</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {(session.role === "SUPER_ADMIN"
            ? [
                { href: "/dashboard", label: "แดชบอร์ด", icon: "📊" },
                { href: "/admin/logs", label: "บันทึกกิจกรรม", icon: "📜" },
                { href: "/leagues", label: "ลีกทั้งหมด", icon: "🏟️" },
                { href: "/search", label: "ค้นหา", icon: "🔍" },
              ]
            : [
                { href: "/teams/mine", label: "จัดการทีม", icon: "🛡️" },
                { href: "/leagues", label: "ลีกทั้งหมด", icon: "🏟️" },
                { href: "/champions", label: "หอเกียรติยศ", icon: "🏆" },
                { href: "/help", label: "คู่มือการใช้งาน", icon: "❓" },
              ]
          ).map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="flex items-center gap-2 rounded-md bg-black/30 border border-white/10 px-3 py-2 hover:border-accent/50 transition-colors"
            >
              <span aria-hidden>{link.icon}</span>
              <span>{link.label}</span>
            </a>
          ))}
        </div>
      </div>

      {squadTotal > 0 && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold">สถานะนักเตะในทีม</h2>
            <a href="/teams/mine" className="text-xs text-accent hover:underline">
              จัดการทีม →
            </a>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-black/30 border border-white/10 py-3">
              <div className="font-display font-bold text-2xl text-accent">
                {squadCount("ACTIVE")}
              </div>
              <div className="text-xs text-foreground/50 mt-0.5">พร้อมเล่น</div>
            </div>
            <div className="rounded-md bg-black/30 border border-white/10 py-3">
              <div className="font-display font-bold text-2xl text-amber-400">
                {squadCount("INJURED")}
              </div>
              <div className="text-xs text-foreground/50 mt-0.5">บาดเจ็บ</div>
            </div>
            <div className="rounded-md bg-black/30 border border-white/10 py-3">
              <div className="font-display font-bold text-2xl text-red-400">
                {squadCount("BANNED")}
              </div>
              <div className="text-xs text-foreground/50 mt-0.5">โดนแบน</div>
            </div>
          </div>
          <p className="text-xs text-foreground/40 mt-3">
            ผู้เล่นทั้งหมด {squadTotal} คน
            {squadCount("BANNED") > 0 && " · มีผู้เล่นโดนแบน ปลดแบนได้ที่หน้าจัดการทีม"}
          </p>
        </div>
      )}

      {nextMatch && (
        <a
          href={`/matches/${nextMatch.id}`}
          className="block rounded-lg bg-card border border-white/10 p-5 hover:border-accent/50 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">
              {nextMatch.status === "LIVE" ? "แมตช์ที่กำลังแข่ง" : "แมตช์ถัดไปของทีม"}
            </h2>
            {nextMatch.status === "LIVE" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-400/15 px-2 py-0.5 text-xs font-medium text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                สด
              </span>
            ) : (
              <span className="text-xs text-accent">ดูรายละเอียด →</span>
            )}
          </div>
          <p className="font-display font-bold text-lg">
            {nextMatch.homeTeam.name} <span className="text-foreground/40">พบ</span>{" "}
            {nextMatch.awayTeam.name}
          </p>
          <p className="text-xs text-foreground/50 mt-1">
            {nextMatch.kickoffAt.toLocaleString("th-TH", {
              dateStyle: "full",
              timeStyle: "short",
            })}
            {nextMatch.venue && ` · ${nextMatch.venue}`}
          </p>
        </a>
      )}

      <div className="rounded-lg bg-card border border-white/10 p-5">
        <h2 className="font-semibold mb-3">เปลี่ยนชื่อที่แสดง</h2>
        <form action={updateProfile} className="flex gap-2">
          <input
            name="name"
            defaultValue={user?.name ?? session.name}
            required
            className="flex-1 rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button type="submit" className="rounded-md bg-white/10 px-4 py-2 text-sm">
            บันทึก
          </button>
        </form>
      </div>

      {session.role === "SUPER_ADMIN" && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold">กิจกรรม 7 วันล่าสุด</h2>
            <span className="text-xs text-foreground/45">
              รวม {weekTotal} ครั้ง
            </span>
          </div>
          {weekTotal > 0 ? (
            <>
              <div className="flex items-end gap-1.5">
                {heatCells.map((c, i) => {
                  const ratio = c.count / heatMax;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-foreground/40">
                        {c.count > 0 ? c.count : ""}
                      </span>
                      <div
                        className="w-full rounded-sm bg-accent"
                        style={{
                          height: `${8 + ratio * 40}px`,
                          opacity: c.count === 0 ? 0.12 : 0.35 + ratio * 0.65,
                        }}
                      />
                      <span className="text-[10px] text-foreground/40">
                        {c.day.toLocaleDateString("th-TH", { weekday: "narrow" })}
                      </span>
                    </div>
                  );
                })}
              </div>
              {topAction && (
                <p className="text-xs text-foreground/40 mt-3">
                  ทำบ่อยที่สุด:{" "}
                  <span className="text-accent">{topAction[0]}</span> ({topAction[1]} ครั้ง)
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-foreground/40">
              ยังไม่มีกิจกรรมในสัปดาห์นี้ เริ่มจัดการลีกได้จากแดชบอร์ด
            </p>
          )}
        </div>
      )}

      {myLogs.length > 0 && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <h2 className="font-semibold mb-3">
            กิจกรรมล่าสุดของฉัน{" "}
            <span className="text-xs text-foreground/45">(ทั้งหมด {myLogCount} รายการ)</span>
          </h2>
          <div className="space-y-1.5 text-sm">
            {myLogs.map((log) => (
              <div key={log.id} className="flex items-baseline gap-2">
                <span className="text-xs text-foreground/40 w-28 shrink-0">
                  {log.createdAt.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <span className="text-accent shrink-0">{log.action}</span>
                <span className="text-foreground/50 truncate">{log.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg bg-card border border-white/10 p-5">
        <h2 className="font-semibold mb-4">เปลี่ยนรหัสผ่าน</h2>

        {message && (
          <p className={`text-sm mb-4 ${message.ok ? "text-accent" : "text-red-400"}`}>
            {message.text}
          </p>
        )}

        <form action={changePassword} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="currentPassword">
              รหัสผ่านปัจจุบัน
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="newPassword">
              รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              minLength={8}
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-foreground/70" htmlFor="confirmPassword">
              ยืนยันรหัสผ่านใหม่
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-accent text-black font-semibold py-2 text-sm"
          >
            เปลี่ยนรหัสผ่าน
          </button>
        </form>
      </div>
    </div>
  );
}
