import Link from "next/link";
import { MobileNav } from "@/components/mobile-nav";

export const metadata = {
  title: "วิธีใช้งาน · 88ArenaLeague",
  description: "คู่มือการใช้งานระบบจัดการลีกฟุตบอล สำหรับผู้ชม ผู้จัดลีก และผู้จัดการทีม",
};

const TOC = [
  { href: "#viewer", label: "🏟 สำหรับผู้ชม" },
  { href: "#admin", label: "⚙ สำหรับผู้จัดลีก" },
  { href: "#manager", label: "👥 สำหรับผู้จัดการทีม" },
  { href: "#faq", label: "❓ คำถามพบบ่อย" },
];

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="w-8 h-8 shrink-0 rounded-full bg-accent text-black font-display font-extrabold grid place-items-center">
        {n}
      </span>
      <div className="pb-6">
        <h3 className="font-display font-bold">{title}</h3>
        <div className="mt-1 text-sm text-foreground/65 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-accent/25 bg-accent/5 px-4 py-3 text-sm text-foreground/75">
      💡 {children}
    </div>
  );
}

export default function HelpPage() {
  const mobileNavItems = [
    { icon: "🏠", label: "หน้าแรก", href: "/" },
    { icon: "📖", label: "วิธีใช้", href: "/help", active: true },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative overflow-hidden bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-10">
        <div className="glow-blob w-80 h-80 -top-24 right-10" />
        <h1 className="font-display italic font-black text-3xl md:text-5xl text-foreground">
          วิธี<span className="text-accent">ใช้งาน</span>
        </h1>
        <p className="mt-2 text-sm text-foreground/60 max-w-xl">
          คู่มือครบทุกขั้นตอน ตั้งแต่เปิดลีก บันทึกผลสดข้างสนาม ไปจนถึงประกาศแชมป์
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {TOC.map((t) => (
            <a
              key={t.href}
              href={t.href}
              className="rounded-full bg-white/5 border border-white/10 px-4 py-1.5 text-sm text-foreground/75 hover:border-accent/50 hover:text-accent"
            >
              {t.label}
            </a>
          ))}
        </div>
      </div>

      <div className="px-6 md:px-16 py-10 flex-1 space-y-14 max-w-4xl">
        {/* ================= ผู้ชม ================= */}
        <section id="viewer" className="scroll-mt-24 space-y-5">
          <h2 className="font-display italic font-extrabold text-2xl">
            🏟 สำหรับ<span className="text-accent">ผู้ชม</span> (ไม่ต้องล็อกอิน)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-card p-4 text-sm space-y-1.5">
              <div className="font-display font-bold">ดูลีกและตารางคะแนน</div>
              <p className="text-foreground/60">
                เข้าเมนู <Link href="/leagues" className="text-accent hover:underline">ลีกทั้งหมด</Link>{" "}
                เลือกลีก → แท็บ <b>ตารางคะแนน</b> มีให้สลับดูแบบรวม/เหย้า/เยือน
                และย้อนดูตาราง ณ นัดใดในอดีตก็ได้
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-4 text-sm space-y-1.5">
              <div className="font-display font-bold">ดูผลสดเรียลไทม์</div>
              <p className="text-foreground/60">
                แมตช์ที่กำลังแข่งจะมีแถบ <span className="text-accent">● LIVE</span> บนหน้าแรก
                กดเข้าไปดูสกอร์ นาที ไทม์ไลน์ และแผนผังตัวจริง — หน้าจะรีเฟรชเองทุก 60 วินาที
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-4 text-sm space-y-1.5">
              <div className="font-display font-bold">สถิติเชิงลึก</div>
              <p className="text-foreground/60">
                ในหน้าลีกมีแท็บ <b>นักเตะ</b> (ดาวซัลโว/แอสซิสต์/MVP), <b>วินัย</b> (ใบเหลือง-แดง),{" "}
                <b>กราฟ</b> (แนวโน้มแต้ม+บันทึกฤดูกาล) และปุ่ม <b>⚖ เปรียบเทียบทีม</b> ในแท็บทีม
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-4 text-sm space-y-1.5">
              <div className="font-display font-bold">ติดตามและแชร์</div>
              <p className="text-foreground/60">
                ปุ่ม <b>📅 เพิ่มลงปฏิทิน</b> โหลดโปรแกรมทั้งลีกเข้า Google/Apple Calendar,
                ปุ่ม <b>⬇ CSV</b> เปิดใน Excel ได้, แชร์ทุกหน้าไป <b>LINE/Facebook</b> พร้อมภาพ preview
              </p>
            </div>
          </div>
          <Tip>
            ใช้เมนู <Link href="/search" className="text-accent hover:underline">ค้นหา</Link>{" "}
            พิมพ์ชื่อทีม นักเตะ ลีก หรือแม้แต่ชื่อสนาม แล้วดูแชมป์เก่าทั้งหมดได้ที่{" "}
            <Link href="/champions" className="text-accent hover:underline">หอเกียรติยศ</Link>
          </Tip>
        </section>

        {/* ================= แอดมิน ================= */}
        <section id="admin" className="scroll-mt-24 space-y-5">
          <h2 className="font-display italic font-extrabold text-2xl">
            ⚙ สำหรับ<span className="text-accent">ผู้จัดลีก</span> (SUPER_ADMIN)
          </h2>

          <div className="rounded-2xl border border-white/10 bg-card p-6">
            <h3 className="font-display font-bold text-lg mb-5">เปิดฤดูกาลใน 4 ขั้น</h3>
            <Step n={1} title="สร้างลีก">
              <Link href="/login" className="text-accent hover:underline">เข้าสู่ระบบ</Link> →
              หน้าภาพรวม → การ์ด <b>สร้างลีกใหม่</b>: ตั้งชื่อ ปีฤดูกาล
              และเลือกพบกันหมดเลกเดียวหรือเหย้า-เยือน 2 นัด
            </Step>
            <Step n={2} title="เพิ่มทีมและผู้จัดการทีม">
              เข้าลีก → ปุ่ม <b>จัดการทีม</b>: เพิ่มทีม (ชื่อ/ตัวย่อ/สี/โลโก้)
              แล้วสร้างบัญชีผู้จัดการทีมให้แต่ละทีม (อีเมล+รหัสผ่าน)
              เพื่อให้เขาจัดการนักเตะเอง — ย้ายนักเตะข้ามทีมได้จากการ์ดล่างสุด
            </Step>
            <Step n={3} title="สร้างตารางแข่ง">
              กลับหน้าลีก → เลือกวันแข่งประจำสัปดาห์ + วันเริ่มฤดูกาล → <b>แสดงตัวอย่าง</b> →
              พอใจแล้วกด <b>ยืนยันและเผยแพร่ตาราง</b> ระบบจัดคู่พบกันหมดพร้อมสลับเหย้า-เยือนให้
              (ตั้งวัน-เวลา-สนามรายนัดทีหลังได้ ทั้งทีละแมตช์และทั้งนัดพร้อมกัน)
            </Step>
            <Step n={4} title="บันทึกผลสดข้างสนาม">
              ถึงเวลาแข่ง เปิดแมตช์จากหน้าลีกหรือ <b>แมตช์วันนี้</b> บนภาพรวม → กด{" "}
              <b>เริ่มการแข่งขัน</b> แล้วใช้ฟอร์มของแต่ละทีม: <b>ประตู</b> (เลือกคนยิง+แอสซิสต์+ปกติ/จุดโทษ/เข้าตัวเอง),{" "}
              <b>ใบเหลือง/แดง</b>, <b>🔄 เปลี่ยนตัว</b>, ปุ่ม <b>+1 สถิติด่วน</b> (ยิง/เตะมุม/ฟาวล์),{" "}
              <b>⏸ พักครึ่ง</b> และ <b>จบการแข่งขัน</b> — นาทีแข่งเดินให้อัตโนมัติ
            </Step>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-xl border border-white/10 bg-card p-4 space-y-1.5">
              <div className="font-display font-bold">แก้ผลที่บันทึกผิด</div>
              <p className="text-foreground/60">
                กด ✕ ท้าย event เพื่อลบ (สกอร์ปรับให้เอง), แก้นาทีในช่องตัวเลขบนไทม์ไลน์,
                หรือกด <b>↩ เปิดแมตช์อีกครั้ง</b> ถ้าเผลอกดจบ
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-4 space-y-1.5">
              <div className="font-display font-bold">หลังจบเกม</div>
              <p className="text-foreground/60">
                เลือก <b>⭐ MVP</b>, กรอกสถิติละเอียด (ครองบอล ฯลฯ), ใส่จำนวนผู้ชม
                และลิงก์ถ่ายทอดสดย้อนหลัง
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-4 space-y-1.5">
              <div className="font-display font-bold">เพลย์ออฟ + ปิดฤดูกาล</div>
              <p className="text-foreground/60">
                ลีกจบครบทุกนัด → กด <b>⚔ สร้างรอบรองชนะเลิศ</b> (อันดับ 1v4, 2v3) →
                สร้างนัดชิง → <b>🏁 ปิดฤดูกาล</b> ระบบขึ้น banner แชมป์และบันทึกลง{" "}
                <Link href="/champions" className="text-accent hover:underline">หอเกียรติยศ</Link> —
                ต่อฤดูกาลหน้าใช้ <b>📋 คัดลอกลีก</b> ได้เลย
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-4 space-y-1.5">
              <div className="font-display font-bold">โปรโมตลีก</div>
              <p className="text-foreground/60">
                โพสต์ <b>ข่าวสาร/ประกาศ</b>, เพิ่ม <b>สปอนเซอร์</b> (โลโก้+ลิงก์),
                เขียนคำอธิบาย/กติกา และตั้งโซนเข้ารอบ-ตกชั้นได้ในการ์ดตั้งค่าลีก
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-4 space-y-1.5">
              <div className="font-display font-bold">ผู้ใช้และความปลอดภัย</div>
              <p className="text-foreground/60">
                การ์ด <b>ผู้ใช้ระบบ</b> บนภาพรวม: เพิ่มแอดมิน รีเซ็ตรหัสผ่านที่ลืม —
                ทุกการกระทำสำคัญถูกบันทึกใน <b>ประวัติระบบ</b>
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-4 space-y-1.5">
              <div className="font-display font-bold">ข้อมูลออกนอกระบบ</div>
              <p className="text-foreground/60">
                หน้าลีกสาธารณะมีปุ่ม CSV/ปฏิทิน .ics และ endpoint JSON + RSS ข่าว
                สำหรับต่อยอดหรือทำสำรองข้อมูล
              </p>
            </div>
          </div>
        </section>

        {/* ================= ผู้จัดการทีม ================= */}
        <section id="manager" className="scroll-mt-24 space-y-5">
          <h2 className="font-display italic font-extrabold text-2xl">
            👥 สำหรับ<span className="text-accent">ผู้จัดการทีม</span> (TEAM_MANAGER)
          </h2>
          <div className="rounded-2xl border border-white/10 bg-card p-6">
            <Step n={1} title="เข้าสู่ระบบครั้งแรก">
              ใช้อีเมล+รหัสผ่านที่ผู้จัดลีกสร้างให้ → ระบบพาเข้า <b>ทีมของฉัน</b> ทันที
              (เปลี่ยนรหัสผ่านเองได้ที่เมนู <b>บัญชี</b>)
            </Step>
            <Step n={2} title="แต่งตัวทีม">
              การ์ด <b>ข้อมูลทีม</b>: แก้ชื่อ ตัวย่อ เลือกสี และอัปโหลดโลโก้จริงของทีม
            </Step>
            <Step n={3} title="ใส่รายชื่อนักเตะ">
              เพิ่มทีละคน (พร้อมรูป) หรือใช้ <b>นำเข้านักเตะเป็นชุด</b> — วางรายชื่อรูปแบบ{" "}
              <code className="text-accent">ชื่อ,เบอร์,ตำแหน่ง</code> บรรทัดละคน ระบบข้ามเบอร์ซ้ำให้
            </Step>
            <Step n={4} title="อัปเดตสถานะและส่งรายชื่อ">
              ตั้งสถานะ ปกติ/บาดเจ็บ/โดนแบน ของแต่ละคน แล้วติ๊กเลือก{" "}
              <b>ตัวจริงนัดถัดไป</b> ก่อนเวลาเตะ (โดนใบแดงระบบตั้งแบนให้อัตโนมัติ —
              พ้นโทษแล้วมาปลดเอง)
            </Step>
            <Step n={5} title="ตามผลงานทีม">
              การ์ดฟอร์มทีมโชว์อันดับ (พร้อมลูกศรขึ้น-ลง) แต้ม คลีนชีต ดาวซัลโวของทีม
              และตารางโปรแกรม/ผลทุกนัด — โหลดปฏิทินทีมเป็น .ics หรือแชร์หน้าทีมได้จากตรงนั้น
            </Step>
          </div>
        </section>

        {/* ================= FAQ ================= */}
        <section id="faq" className="scroll-mt-24 space-y-4">
          <h2 className="font-display italic font-extrabold text-2xl">
            ❓ คำถาม<span className="text-accent">พบบ่อย</span>
          </h2>
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-card p-4">
              <div className="font-display font-bold">นาทีการแข่งขันมาจากไหน ทำไมไม่ต้องกรอก?</div>
              <p className="mt-1 text-foreground/60">
                ระบบจับเวลาเองตั้งแต่กด &quot;เริ่มการแข่งขัน&quot; และเติมนาทีปัจจุบันให้ในทุกฟอร์ม
                แก้ตัวเลขก่อนกดบันทึกได้เสมอ
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-4">
              <div className="font-display font-bold">แต้มเท่ากันใครได้อันดับดีกว่า?</div>
              <p className="mt-1 text-foreground/60">
                เรียงตาม head-to-head ของทีมที่แต้มเท่ากันก่อน (แต้ม→ผลต่างในเกมที่เจอกัน)
                แล้วค่อยดูผลต่างประตูรวมและประตูได้
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-4">
              <div className="font-display font-bold">รอบเพลย์ออฟถ้าเสมอกันตัดสินยังไง?</div>
              <p className="mt-1 text-foreground/60">ทีมที่อันดับลีกดีกว่าผ่านเข้ารอบ</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-4">
              <div className="font-display font-bold">แมตช์เพลย์ออฟนับแต้มในตารางไหม?</div>
              <p className="mt-1 text-foreground/60">
                ไม่นับ — ตารางคะแนนคิดเฉพาะรอบลีก ส่วนดาวซัลโว/ใบโทษนับรวมทุกนัด
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-4">
              <div className="font-display font-bold">ลืมรหัสผ่านทำยังไง?</div>
              <p className="mt-1 text-foreground/60">
                แจ้งผู้จัดลีกให้รีเซ็ตจากการ์ดผู้ใช้ระบบบนหน้าภาพรวม แล้วค่อยตั้งรหัสใหม่เองที่เมนูบัญชี
              </p>
            </div>
          </div>
        </section>

        <div className="rounded-2xl border border-accent/30 bg-gradient-to-r from-[#1a2e12] to-card p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-display font-bold text-lg">พร้อมเปิดลีกของคุณแล้ว?</div>
            <div className="text-sm text-foreground/60">เริ่มจัดลีกแรกได้ในไม่กี่นาที</div>
          </div>
          <Link
            href="/login"
            className="rounded-md bg-accent px-6 py-2.5 font-display font-bold text-black"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>

      <MobileNav items={mobileNavItems} />
    </div>
  );
}
