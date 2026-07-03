import { PublicNav } from "@/components/public-nav";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <PublicNav />
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
