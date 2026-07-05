import Link from "next/link";

const NAV_LINKS = [
  { href: "/", label: "หน้าแรก" },
  { href: "/live", label: "สด" },
  { href: "/leagues", label: "ลีกทั้งหมด" },
  { href: "/stats", label: "สถิติรวม" },
  { href: "/search", label: "ค้นหา" },
  { href: "/champions", label: "หอเกียรติยศ" },
  { href: "/help", label: "วิธีใช้" },
];

export function PublicNav() {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-12 h-16 border-b border-white/10 bg-card/80 backdrop-blur-md">
      <Link href="/" className="font-display italic font-bold text-xl text-foreground">
        88ARENA<span className="text-accent">LEAGUE</span>
      </Link>
      <nav className="hidden md:flex items-center gap-8 text-sm text-foreground/75">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="relative hover:text-accent after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:bg-accent after:transition-all hover:after:w-full"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <Link
        href="/login"
        className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-black shadow-[0_0_18px_-6px_var(--accent)]"
      >
        เข้าสู่ระบบ
      </Link>
    </header>
  );
}
