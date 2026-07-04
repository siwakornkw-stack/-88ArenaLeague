import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const liveCount =
    session.role === "SUPER_ADMIN" ? await prisma.match.count({ where: { status: "LIVE" } }) : 0;

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar session={session} liveCount={liveCount} />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
