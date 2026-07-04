"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="font-display italic font-black text-5xl text-red-400">ขออภัย</div>
      <h1 className="font-display font-bold text-xl">เกิดข้อผิดพลาดบางอย่าง</h1>
      <p className="text-sm text-foreground/55">ลองใหม่อีกครั้ง หรือกลับหน้าแรก</p>
      <div className="flex gap-3 mt-2">
        <button
          onClick={reset}
          className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-black"
        >
          ลองใหม่
        </button>
        <a
          href="/"
          className="rounded-md border border-white/20 px-5 py-2 text-sm text-foreground/80"
        >
          กลับหน้าแรก
        </a>
      </div>
    </div>
  );
}
