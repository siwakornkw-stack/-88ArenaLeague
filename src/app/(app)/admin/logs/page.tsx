import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") redirect("/teams/mine");

  const { action } = await searchParams;
  const actionFilter = action?.trim() || null;

  const [logs, actions] = await Promise.all([
    prisma.adminLog.findMany({
      where: actionFilter ? { action: actionFilter } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.adminLog.findMany({ distinct: ["action"], select: { action: true } }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display font-bold text-3xl">ประวัติระบบ</h1>
        <p className="text-foreground/60 mt-1">บันทึกการทำงานของแอดมิน (ล่าสุด 200 รายการ)</p>
      </div>

      <form method="get" className="flex items-center gap-2">
        <select
          name="action"
          defaultValue={actionFilter ?? ""}
          className="rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="">ทุกประเภท</option>
          {actions.map((a) => (
            <option key={a.action} value={a.action}>
              {a.action}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-white/10 px-4 py-2 text-sm">
          กรอง
        </button>
      </form>

      <div className="rounded-lg bg-card border border-white/10 divide-y divide-white/5">
        {logs.map((log) => (
          <div key={log.id} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
            <span className="text-xs text-foreground/40 w-36 shrink-0">
              {log.createdAt.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "medium" })}
            </span>
            <span className="text-foreground/70 shrink-0">{log.userName}</span>
            <span className="text-accent shrink-0">{log.action}</span>
            <span className="text-foreground/50 truncate">{log.detail}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <p className="px-4 py-6 text-sm text-foreground/50">ยังไม่มีบันทึก</p>
        )}
      </div>
    </div>
  );
}
