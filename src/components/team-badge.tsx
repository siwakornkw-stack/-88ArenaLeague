export function TeamBadge({
  abbr,
  color,
  logoUrl,
  className = "w-10 h-10 text-xs",
}: {
  abbr: string;
  color: string;
  logoUrl?: string | null;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={abbr}
        className={`rounded-full object-cover shrink-0 bg-black/30 ${className}`}
      />
    );
  }
  return (
    <span
      className={`rounded-full shrink-0 grid place-items-center font-display font-bold ${className}`}
      style={{ backgroundColor: color }}
    >
      {abbr}
    </span>
  );
}
