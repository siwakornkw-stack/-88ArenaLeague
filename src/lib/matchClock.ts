export function computeLiveMinute(kickoffEventAt: Date): number {
  const minutes = Math.floor((Date.now() - kickoffEventAt.getTime()) / 60000);
  return Math.min(130, Math.max(0, minutes));
}
