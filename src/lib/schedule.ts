export type ScheduleMatch = {
  round: number;
  homeTeamId: string;
  awayTeamId: string;
};

const BYE = null;

export function roundRobin(teamIds: string[], legs: number): ScheduleMatch[] {
  const ids: (string | null)[] = [...teamIds];
  if (ids.length % 2 === 1) ids.push(BYE);

  const n = ids.length;
  const totalRounds = n - 1;
  const arr = ids.slice();
  const matches: ScheduleMatch[] = [];

  for (let leg = 0; leg < legs; leg++) {
    for (let r = 0; r < totalRounds; r++) {
      for (let i = 0; i < n / 2; i++) {
        let home = arr[i];
        let away = arr[n - 1 - i];
        if (home === BYE || away === BYE) continue;
        if ((r + i) % 2 === 1) [home, away] = [away, home];
        if (leg === 1) [home, away] = [away, home];
        matches.push({ round: leg * totalRounds + r + 1, homeTeamId: home, awayTeamId: away });
      }
      arr.splice(1, 0, arr.pop()!);
    }
  }

  return matches;
}
