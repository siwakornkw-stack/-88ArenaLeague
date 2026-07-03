import Link from "next/link";

export function PublicNav() {
  return (
    <header className="flex items-center justify-between px-6 md:px-12 h-16 border-b border-white/10 bg-card">
      <Link href="/" className="font-display italic font-bold text-xl text-foreground">
        88ARENA<span className="text-accent">LEAGUE</span>
      </Link>
      <nav className="hidden md:flex items-center gap-8 text-sm text-foreground/75">
        <Link href="/" className="hover:text-accent">
          หน้าแรก
        </Link>
      </nav>
      <Link
        href="/login"
        className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-black"
      >
        เข้าสู่ระบบ
      </Link>
    </header>
  );
}
