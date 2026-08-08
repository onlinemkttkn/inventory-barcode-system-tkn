# TKN v5.30.1 FINAL CUMULATIVE

แพตช์นี้รวม dependency ของ v5.29.0 และ Warehouse One-Flow v5.30.0 เพื่อให้ติดตั้งทับ Full Pack (29) ได้โดยไม่ต้องสมมติว่าไฟล์ Scanner/Auth รุ่นก่อนถูกอัปครบแล้ว

## ลำดับติดตั้ง
1. รัน `sql/00-PREFLIGHT-v5.30.0-READ-ONLY.sql` — ทุกข้อ PASS เท่านั้น
2. รัน `sql/01-INSTALL-v5.30.0-WAREHOUSE-FLOW.sql`
3. รัน `sql/02-VERIFY-v5.30.0-READ-ONLY.sql` — ทุกข้อ PASS
4. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์ v5.30.1 ทับ path เดิม
5. ปิดแท็บ TKN เก่าทั้งหมด เปิดใหม่ แล้ว Refresh 1 ครั้งเพื่อ activate Service Worker v5.30.0
6. ทดสอบ UAT ตาม `UAT-v5.30.0.md`

## Flow
Close Box -> WAITING_STOCK -> Stock Intake -> IN_STOCK + WAITING_PUTAWAY -> Putaway -> Issue -> Storefront/POS

## Protected
ไม่ได้แก้ stock-promotions / promotion JS / print-labels
