# ROADMAP — ฟีเจอร์ที่สเปกไว้แล้ว รอสั่งทำ

แบตช์ล่าสุดลงจริง ~45 ตัว (ดู git log). รายการนี้คือส่วนที่เหลือของโควตา 100 — สเปกพร้อมทำ พิมพ์ "ทำต่อจาก ROADMAP" เพื่อไล่ลงเป็นชุด

## ต้อง migrate schema (ชุดละ 1 migration)

1. Player.nickname — ชื่อเล่นโชว์ในวงเล็บ
2. Player.birthYear — อายุบนโปรไฟล์
3. Player.heightCm / weightKg — สเปกร่างกาย
4. Team.foundedYear — "ก่อตั้ง พ.ศ. ..."
5. Team.homeVenue — สนามเหย้า default ตอน gen ตาราง
6. Team.coachName — โค้ชโชว์หน้าทีม
7. League.rulesUrl — ลิงก์กติกาฉบับเต็ม (PDF ภายนอก)
8. League.registrationOpen boolean — ป้าย "เปิดรับสมัคร" บนการ์ดลีก
9. Match.refereeName — ผู้ตัดสิน
10. Match.weatherNote — สภาพอากาศ
11. MatchEvent type PENALTY_MISSED — จุดโทษพลาด (ไอคอน ❌)
12. MatchEvent type INJURY — เหตุการณ์บาดเจ็บใน timeline
13. MatchLineup.shirtNumber override — ใส่เบอร์เฉพาะนัด
14. User.lastLoginAt — โชว์ใน user management
15. LeagueNews.pinned — ปักหมุดประกาศ
16. AdminLog.leagueId — filter ประวัติรายลีก

## Computed / UI (ไม่ migrate)

17. กราฟ donut ครองบอลใน match stats (SVG stroke-dasharray)
18. ตาราง xG-lite: shots on target ratio ต่อทีมใน stats tab
19. Poisson-ish "โอกาสชนะ" preview จากฟอร์ม 5 นัด (แสดง % หยาบ)
20. Head-to-head widget บนหน้า compare แบบ bar รวมประตู
21. Minute heatmap ประตูทั้งลีก (bucket 15 นาที) ใน tab กราฟ
22. Streak badges: ชนะติด N / ไม่แพ้ N นัด บนหน้าทีม
23. อันดับดาวซัลโวข้างชื่อในหน้านักเตะ ("อันดับ 3 ของลีก")
24. หน้าลีก: ตาราง "ผลงานกับ Top 4" ต่อทีม
25. Fixtures: ปุ่มสลับมุมมอง list / ตาราง grid รายสัปดาห์
26. Standings: คอลัมน์แต้มเฉลี่ย/นัด (toggle ผ่าน query)
27. Champions: filter ตามปี (dropdown)
28. Search: กรองผลตามลีก (dropdown)
29. Player: เปรียบเทียบนักเตะ 2 คน (หน้า /players/compare)
30. Team: ตาราง head-to-head กับทุกทีม (mini grid)
31. Landing: นับสถิติ animate นับเลข? (ต้อง JS — ตัดทิ้ง) → แทน: การ์ดลีกเด่นโชว์ form leader
32. หน้า match: "แมตช์อื่นวันเดียวกัน" strip ล่าง
33. หน้า match: breadcrumb ลีก > นัดที่ N
34. MobileNav: เพิ่มแท็บแชร์ (native share URL ผ่าน href="sms:"? — ประเมินอีกที)
35. RSS รวมทุกลีก (/news.xml ราก)
36. iCal ต่อทีมแนบสีทีมใน SUMMARY prefix
37. CSV นักเตะทั้งลีก (ชื่อ/ทีม/เบอร์/สถิติ)
38. JSON export เพิ่ม events ต่อแมตช์ (?deep=1)
39. OG image หน้า /leagues (สรุปจำนวนลีก)
40. OG image หน้านักเตะ (รูป+สถิติ)

## Admin/Manager ops

41. Bulk สร้างทีม (textarea ชื่อทีมบรรทัดละทีม)
42. Bulk ตั้ง venue ทั้งลีก
43. เลื่อนทั้งฤดูกาล +N วัน (shift ทุกนัด SCHEDULED)
44. สลับเหย้า-เยือนรายแมตช์ (ปุ่ม swap ก่อนเตะ)
45. ปุ่ม "จบครึ่งแรกอัตโนมัติที่ 45'" — สร้าง HT event ด้วย minute 45 เสมอ (toggle)
46. Admin แก้ MVP ย้อนหลังจากหน้า logs ลิงก์ตรง
47. Manager เห็น "ใบเหลืองสะสมใกล้แบน" list ของทีมตัวเอง
48. Manager export รายชื่อทีมตัวเอง CSV
49. Admin: รวมหน้า "แมตช์ทั้งหมดวันนี้ทุกลีก" (/admin/today)
50. Admin: archive league (ซ่อนจาก /leagues แต่ URL ตรงยังเข้าได้) — ต้อง field hidden (migrate)
51. Sponsor คลิกนับสถิติ (redirect route + count field — migrate)
52. News schedule เผยแพร่ล่วงหน้า (publishAt — migrate)
53. หน้า print-friendly ตารางคะแนน (route /print CSS @media print)
54. Admin logs: export CSV
55. Users: ปิดการใช้งานชั่วคราว (isActive — migrate)

รวมค้าง ~55 — บวกที่ลงแล้ว ≈ ครบโควตา 100
