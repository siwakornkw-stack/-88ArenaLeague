export function ShareLinks({ url, text }: { url: string; text: string }) {
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-foreground/40">แชร์:</span>
      <a
        href={`https://social-plugins.line.me/lineit/share?url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md bg-[#06C755] text-white font-semibold px-3 py-1.5"
      >
        LINE
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md bg-[#1877F2] text-white font-semibold px-3 py-1.5"
      >
        Facebook
      </a>
    </div>
  );
}
