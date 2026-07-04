import { EVENT_ICON } from "@/lib/matchEvents";

type TimelineEvent = {
  id: string;
  minute: number;
  label: string;
  type: string;
  side: string;
};

export function MatchTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-foreground/50 text-sm">ยังไม่มีเหตุการณ์</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {events.map((ev) =>
        ev.side === "NEUTRAL" ? (
          <div key={ev.id} className="text-center text-xs text-foreground/45 py-1.5">
            {EVENT_ICON[ev.type]} {ev.label}
            {ev.minute > 0 && ` · ${ev.minute}'`}
          </div>
        ) : (
          <div
            key={ev.id}
            className="grid grid-cols-[1fr_44px_1fr] items-center gap-2 min-h-[36px]"
          >
            <div className="text-right text-sm">
              {ev.side === "HOME" && (
                <span>
                  {ev.label} <span className="text-base">{EVENT_ICON[ev.type]}</span>
                </span>
              )}
            </div>
            <span className="text-center text-xs font-display font-bold text-foreground/60">
              {ev.minute}&apos;
            </span>
            <div className="text-sm">
              {ev.side === "AWAY" && (
                <span>
                  <span className="text-base">{EVENT_ICON[ev.type]}</span> {ev.label}
                </span>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
