# ROADMAP — คงเหลือหลัง batch ล่าสุด (commit 456bbba ลงไป 30 ตัว)

พิมพ์ "ทำต่อจาก ROADMAP" เพื่อไล่ชุดถัดไป

## ต้อง migrate

1. Player.heightCm / weightKg — สเปกร่างกายบนโปรไฟล์
2. League.rulesUrl — ลิงก์กติกาฉบับเต็ม
3. MatchEvent type INJURY — เหตุการณ์บาดเจ็บใน timeline
4. MatchLineup.shirtNumber override เฉพาะนัด
5. AdminLog.leagueId — filter ประวัติรายลีก
6. League.hidden — archive league ออกจาก /leagues
7. LeagueSponsor.clicks + redirect route นับคลิก
8. LeagueNews.publishAt — ตั้งเวลาเผยแพร่
9. User.isActive — ปิดใช้งานบัญชีชั่วคราว

## Computed / UI

10. Donut ครองบอล SVG บนหน้า match
11. "โอกาสชนะ" % หยาบจากฟอร์ม 5 นัด (preview นัดที่ยังไม่เตะ)
12. Compare: bar รวมประตู H2H
13. ตาราง "ผลงานกับ Top 4" ต่อทีมในหน้าลีก
14. Fixtures มุมมองตาราง grid รายสัปดาห์ (toggle)
15. หน้าเปรียบเทียบนักเตะ 2 คน (/leagues/[id]/players/compare)
16. Team: mini grid head-to-head กับทุกทีม
17. การ์ดลีกเด่นบน landing โชว์ฟอร์มจ่าฝูง
18. iCal: prefix ตัวย่อทีมใน SUMMARY เมื่อกรอง ?team=
19. OG image หน้า /leagues และหน้านักเตะ (มีรูป)
20. MobileNav ปุ่มแชร์เพจปัจจุบัน

## Admin/Manager ops

21. Bulk ตั้ง venue ทั้งลีกครั้งเดียว
22. ปุ่ม "HT ที่นาที 45 เสมอ" (toggle ค่า default)
23. ลิงก์แก้ MVP ตรงจาก /admin/logs
24. Admin logs export CSV
25. หน้า print แยก (/leagues/[id]/print) จัด layout กระดาษเฉพาะ
