const W = 640;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 32 };

export function GoalsBarChart({
  rounds,
  values,
}: {
  rounds: (number | string)[];
  values: number[];
}) {
  const max = Math.max(...values, 1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = innerW / rounds.length;
  const barW = Math.min(28, step * 0.6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
      {values.map((v, i) => {
        const h = (v / max) * innerH;
        const x = PAD.left + i * step + (step - barW) / 2;
        const y = PAD.top + innerH - h;
        return (
          <g key={rounds[i]}>
            <rect x={x} y={y} width={barW} height={h} rx={3} fill="#D4FF3A" />
            <text
              x={x + barW / 2}
              y={y - 4}
              textAnchor="middle"
              fontSize="10"
              fill="rgba(255,255,255,.7)"
            >
              {v}
            </text>
            <text
              x={x + barW / 2}
              y={H - 10}
              textAnchor="middle"
              fontSize="9"
              fill="rgba(255,255,255,.4)"
            >
              {rounds[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function PointsLineChart({
  rounds,
  series,
}: {
  rounds: number[];
  series: { name: string; color: string; points: number[] }[];
}) {
  const max = Math.max(...series.flatMap((s) => s.points), 1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (rounds.length === 1 ? innerW / 2 : (i / (rounds.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
        {[0, Math.round(max / 2), max].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              y1={y(tick)}
              x2={W - PAD.right}
              y2={y(tick)}
              stroke="rgba(255,255,255,.08)"
            />
            <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" fontSize="9" fill="rgba(255,255,255,.4)">
              {tick}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <polyline
            key={s.name}
            points={s.points.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
          />
        ))}
        {rounds.map((r, i) => (
          <text
            key={r}
            x={x(i)}
            y={H - 10}
            textAnchor="middle"
            fontSize="9"
            fill="rgba(255,255,255,.4)"
          >
            {r}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-4 mt-2 text-xs text-foreground/60">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span className="w-3 h-1 rounded-full inline-block" style={{ backgroundColor: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
