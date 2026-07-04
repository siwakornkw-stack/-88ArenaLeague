import { EVENT_ICON } from "@/lib/matchEvents";

type TimelineEvent = {
  id: string;
  minute: number;
  label: string;
  type: string;
  side: string;
  player?: { name: string } | null;
  relatedPlayer?: { name: string } | null;
};

const DELETABLE_EVENT_TYPES = new Set(["GOAL", "YELLOW_CARD", "RED_CARD", "SUBSTITUTION"]);

function eventText(ev: TimelineEvent) {
  let text = ev.label;
  if (ev.type !== "SUBSTITUTION" && ev.player) text += ` — ${ev.player.name}`;
  if (ev.type === "GOAL" && ev.relatedPlayer) text += ` (แอสซิสต์: ${ev.relatedPlayer.name})`;
  return text;
}

function DeleteButton({
  eventId,
  deleteAction,
}: {
  eventId: string;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={deleteAction} className="inline">
      <input type="hidden" name="eventId" value={eventId} />
      <button
        type="submit"
        title="ลบเหตุการณ์นี้"
        className="text-foreground/30 hover:text-red-400 text-xs px-1"
      >
        ✕
      </button>
    </form>
  );
}

export function MatchTimeline({
  events,
  deleteAction,
}: {
  events: TimelineEvent[];
  deleteAction?: (formData: FormData) => Promise<void>;
}) {
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
                  {deleteAction && DELETABLE_EVENT_TYPES.has(ev.type) && (
                    <DeleteButton eventId={ev.id} deleteAction={deleteAction} />
                  )}
                  {eventText(ev)} <span className="text-base">{EVENT_ICON[ev.type]}</span>
                </span>
              )}
            </div>
            <span className="text-center text-xs font-display font-bold text-foreground/60">
              {ev.minute}&apos;
            </span>
            <div className="text-sm">
              {ev.side === "AWAY" && (
                <span>
                  <span className="text-base">{EVENT_ICON[ev.type]}</span> {eventText(ev)}
                  {deleteAction && DELETABLE_EVENT_TYPES.has(ev.type) && (
                    <DeleteButton eventId={ev.id} deleteAction={deleteAction} />
                  )}
                </span>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
