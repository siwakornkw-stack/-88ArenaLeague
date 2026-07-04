import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 50;

function relativeTime(d: Date) {
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "เมื่อครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชม.ที่แล้ว`;
  return `${Math.floor(hrs / 24)} วันที่แล้ว`;
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string }>;
}) {
  const session = await getSession();
  if (session?.role !== "SUPER_ADMIN") redirect("/teams/mine");

  const { action, page } = await searchParams;
  const actionFilter = action?.trim() || null;
  const pageNum = Math.max(1, Number(page) || 1);

  const [logs, actions, total] = await Promise.all([
    prisma.adminLog.findMany({
      where: actionFilter ? { action: actionFilter } : undefined,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (pageNum - 1) * PAGE_SIZE,
    }),
    prisma.adminLog.findMany({ distinct: ["action"], select: { action: true } }),
    prisma.adminLog.count({ where: actionFilter ? { action: actionFilter } : undefined }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display font-bold text-3xl">ประวัติระบบ</h1>
        <p className="text-foreground/60 mt-1">
          บันทึกการทำงานของแอดมิน · {total} รายการ · หน้า {pageNum}/{totalPages}
        </p>
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
            <span
              className="text-xs text-foreground/40 w-36 shrink-0"
              title={log.createdAt.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "medium" })}
            >
              {relativeTime(log.createdAt)}
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

      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {pageNum > 1 && (
            <a
              href={`/admin/logs?page=${pageNum - 1}${actionFilter ? `&action=${encodeURIComponent(actionFilter)}` : ""}`}
              className="rounded-md bg-white/10 px-4 py-2 hover:text-accent"
            >
              ← ก่อนหน้า
            </a>
          )}
          {pageNum < totalPages && (
            <a
              href={`/admin/logs?page=${pageNum + 1}${actionFilter ? `&action=${encodeURIComponent(actionFilter)}` : ""}`}
              className="rounded-md bg-white/10 px-4 py-2 hover:text-accent"
            >
              ถัดไป →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
