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
    include: { managedTeams: { select: { name: true } } },
  });
  const myLogs =
    session.role === "SUPER_ADMIN"
      ? await prisma.adminLog.findMany({
          where: { userId: session.userId },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : [];

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
              {user.managedTeams.map((t) => t.name).join(", ")}
            </p>
          )}
          <p>
            <span className="text-foreground/50">สมาชิกตั้งแต่:</span>{" "}
            {user.createdAt.toLocaleDateString("th-TH", { dateStyle: "long" })}
          </p>
        </div>
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

      {myLogs.length > 0 && (
        <div className="rounded-lg bg-card border border-white/10 p-5">
          <h2 className="font-semibold mb-3">กิจกรรมล่าสุดของฉัน</h2>
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
