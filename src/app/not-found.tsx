import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="font-display italic font-black text-6xl text-accent">404</div>
      <h1 className="font-display font-bold text-xl">ไม่พบหน้าที่คุณต้องการ</h1>
      <p className="text-sm text-foreground/55">ลิงก์อาจถูกลบไปแล้ว หรือพิมพ์ที่อยู่ผิด</p>
      <div className="flex gap-3 mt-2">
        <Link href="/" className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-black">
          กลับหน้าแรก
        </Link>
        <Link
          href="/leagues"
          className="rounded-md border border-white/20 px-5 py-2 text-sm text-foreground/80"
        >
          ดูลีกทั้งหมด
        </Link>
      </div>
    </div>
  );
}
