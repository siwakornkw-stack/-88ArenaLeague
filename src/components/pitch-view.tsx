type PitchPlayer = { id: string; name: string; number: number; position: string };

function positionGroup(position: string): "GK" | "DF" | "MF" | "FW" {
  const p = position.toUpperCase();
  if (p.includes("GK") || position.includes("ผู้รักษา")) return "GK";
  if (p.includes("DF") || p.includes("CB") || p.includes("LB") || p.includes("RB") || position.includes("กองหลัง")) return "DF";
  if (p.includes("FW") || p.includes("ST") || position.includes("กองหน้า") || position.includes("ปีก")) return "FW";
  return "MF";
}

export function PitchView({
  teamName,
  color,
  players,
}: {
  teamName: string;
  color: string;
  players: PitchPlayer[];
}) {
  const groups: Record<"GK" | "DF" | "MF" | "FW", PitchPlayer[]> = {
    GK: [],
    DF: [],
    MF: [],
    FW: [],
  };
  for (const p of players) groups[positionGroup(p.position)].push(p);

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <div className="px-4 py-2 bg-card font-display font-bold text-sm">{teamName}</div>
      <div className="relative bg-gradient-to-b from-[#123B1E] to-[#0D2B16] px-3 py-5 flex flex-col gap-5">
        <div className="absolute inset-x-8 top-0 h-10 border-x border-b border-white/15 rounded-b-lg" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-white/15" />
        {(["GK", "DF", "MF", "FW"] as const).map((g) => (
          <div key={g} className="relative flex flex-wrap justify-center gap-x-4 gap-y-2 min-h-10">
            {groups[g].map((p) => (
              <div key={p.id} className="flex flex-col items-center w-14">
                <span
                  className="w-8 h-8 rounded-full grid place-items-center font-display font-bold text-xs border border-white/25"
                  style={{ backgroundColor: color }}
                >
                  {p.number}
                </span>
                <span className="mt-1 text-[10px] text-foreground/80 text-center leading-tight truncate w-full">
                  {p.name}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
