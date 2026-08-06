# ขั้นตอนติดตั้ง v5.26.2

ฐานระบบต้องติดตั้ง **v5.26.1 DB-SAFE** สำเร็จก่อน

1. สำรองฐานข้อมูลและไฟล์หน้าเว็บปัจจุบัน
2. เปิด Supabase SQL Editor แล้วรัน `sql/00-PREFLIGHT-v5.26.2-READ-ONLY.sql`
3. ตรวจให้รายการ Required Objects/Columns เป็น `PASS`
4. เก็บผล Core Counts และ Trigger Counts เป็น Baseline
5. รัน `sql/03-HOTFIX-v5.26.2-CASHIER-POS-INLINE.sql`
6. รัน `sql/02-VERIFY-v5.26.2-READ-ONLY.sql`
7. เปรียบเทียบ Core Counts/Trigger Counts กับ Baseline ต้องไม่เปลี่ยนจากการติดตั้ง
8. อัปโหลดไฟล์ใน Patch วางทับตำแหน่งเดิม โดยรักษาโครงสร้างโฟลเดอร์
9. เปิดระบบแล้ว Hard Refresh (`Ctrl+Shift+R`) หรือปิดและเปิด PWA ใหม่
10. ทดสอบตาม `UAT-v5.26.2.md` ด้วยกล่องทดลองก่อนเปิดใช้จริง

## ห้ามทำ

- ห้ามลบไฟล์ระบบเก่าก่อนทดสอบผ่าน
- ห้ามรัน SQL จาก v5.26.0 รุ่นเดิม
- ห้ามใช้ Rollback ขณะมีรายการขายยกกล่องแบบ Draft ที่ยังต้องใช้งาน

## การย้อนกลับหน้าเว็บ

นำไฟล์ v5.26.1 ที่สำรองไว้วางกลับ โดยเฉพาะ `pos.html`, `pos-v5-26-1.js`, `js/app-shell-v5-19.js`, `manifest.webmanifest` และ Service Worker

## การย้อนกลับวัตถุฐานข้อมูลใหม่

ใช้ `sql/99-ROLLBACK-v5.26.2-NEW-OBJECTS-ONLY.sql` เฉพาะเมื่อยืนยันว่าไม่ต้องใช้ Draft ของ v5.26.2 แล้ว ไฟล์นี้ลบเฉพาะวัตถุชื่อ `tkn_v5262_*` ไม่ลบข้อมูลหลักของ v5.26.1
