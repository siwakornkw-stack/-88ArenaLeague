export function computeLiveMinute(kickoffEventAt: Date): number {
  return Math.max(0, Math.floor((Date.now() - kickoffEventAt.getTime()) / 60000));
}
