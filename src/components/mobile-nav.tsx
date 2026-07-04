import Link from "next/link";

export type MobileNavItem = {
  icon: string;
  label: string;
  href: string;
  active?: boolean;
};

export function MobileNav({ items }: { items: MobileNavItem[] }) {
  return (
    <nav className="md:hidden sticky bottom-0 z-50 border-t border-white/10 bg-card/85 backdrop-blur-md flex justify-around py-2">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-medium px-3 py-1 ${
            item.active ? "text-accent" : "text-foreground/45"
          }`}
        >
          <span className="text-base leading-none">{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
