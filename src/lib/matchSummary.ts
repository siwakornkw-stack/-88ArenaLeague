type SummaryEvent = {
  type: string;
  side: string;
  minute: number;
  player?: { name: string } | null;
};

type SummaryMatch = {
  status: string;
  homeScore: number;
  awayScore: number;
  homeTeam: { name: string };
  awayTeam: { name: string };
  events: SummaryEvent[];
};

export function buildMatchSummary(match: SummaryMatch): string | null {
  if (match.status === "SCHEDULED") return null;

  const scoring = match.events
    .filter((e) => e.type === "GOAL" || e.type === "OWN_GOAL")
    .sort((a, b) => a.minute - b.minute);

  const sentences: string[] = [];
  let h = 0;
  let a = 0;

  for (const ev of scoring) {
    const scoredForHome = ev.type === "GOAL" ? ev.side === "HOME" : ev.side === "AWAY";
    const wasLevel = h === a;
    const leaderBefore = h > a ? "HOME" : a > h ? "AWAY" : null;
    if (scoredForHome) h++;
    else a++;

    const team = scoredForHome ? match.homeTeam.name : match.awayTeam.name;
    const scorer = ev.player?.name;
    const isOwnGoal = ev.type === "OWN_GOAL";

    const credit = isOwnGoal
      ? scorer
        ? `จากจังหวะทำเข้าตัวเองของ ${scorer}`
        : "จากจังหวะทำเข้าตัวเอง"
      : scorer
        ? `จาก ${scorer}`
        : "";

    let phrase: string;
    if (h + a === 1) {
      phrase = `${team} ออกนำก่อน ${credit} ในนาทีที่ ${ev.minute}`;
    } else if (h === a) {
      phrase = `${team} ตามตีเสมอ ${h}-${a} ${credit} นาทีที่ ${ev.minute}`;
    } else if (wasLevel) {
      phrase = `${team} ขยับขึ้นนำ ${h}-${a} ${credit} นาทีที่ ${ev.minute}`;
    } else if (leaderBefore && ((scoredForHome && leaderBefore === "AWAY") || (!scoredForHome && leaderBefore === "HOME"))) {
      phrase = `${team} ไล่มาเป็น ${h}-${a} ${credit} นาทีที่ ${ev.minute}`;
    } else {
      phrase = `${team} หนีห่างเป็น ${h}-${a} ${credit} นาทีที่ ${ev.minute}`;
    }
    sentences.push(phrase.replace(/\s+/g, " ").trim());
  }

  if (match.status === "FINISHED") {
    if (match.homeScore === match.awayScore) {
      sentences.push(
        scoring.length === 0
          ? `จบเกม ${match.homeTeam.name} กับ ${match.awayTeam.name} เสมอกันไร้สกอร์`
          : `จบเกมทั้งสองทีมแบ่งแต้มกันไปที่ ${match.homeScore}-${match.awayScore}`
      );
    } else {
      const winner = match.homeScore > match.awayScore ? match.homeTeam.name : match.awayTeam.name;
      const loser = match.homeScore > match.awayScore ? match.awayTeam.name : match.homeTeam.name;
      sentences.push(
        `จบเกม ${winner} เอาชนะ ${loser} ไป ${Math.max(match.homeScore, match.awayScore)}-${Math.min(match.homeScore, match.awayScore)}`
      );
    }
  } else if (sentences.length === 0) {
    return null;
  }

  return sentences.join(" ");
}
