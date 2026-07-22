# TKN POS / ERP Version 2.1 — Bill Control & Revenue Dashboard

## แก้ไข
- เพิ่มไฟล์หน้า `phase-9-2-void-bill.html` ที่ขาดจาก Version 2.0
- เพิ่ม JS/CSS ยกเลิกบิล
- เพิ่ม Dashboard ตรวจบิลรายวัน/เดือน/ปี
- แยกรายรับ เงินสด, QR/โอน, บัตร
- แสดงจำนวนบิล, รายรับรวม, เฉลี่ยต่อบิล, บิลยกเลิก, ยอดคืนสินค้า
- กดรายละเอียดเพื่อดูสินค้า จำนวนขาย คืนแล้ว ราคาต่อหน่วย และยอดรวม

## ติดตั้ง
1. อัปโหลดไฟล์ทั้งหมดเข้า Repository root และยืนยันเขียนทับ
2. รัน SQL ตามลำดับ:
   - `sql/00-check-void-sale-rpc.sql`
   - `sql/01-install-sales-control-dashboard-v2-1.sql`
3. SQL แรกต้องแสดง function `void_sale_phase_9_2(uuid,text)` หรือ signature ใกล้เคียง
4. Commit: `Deploy Version 2.1 bill control and revenue dashboard`
5. เปิด `dashboard.html` แล้วกด Ctrl+Shift+R

## หากยกเลิกบิลยังไม่สำเร็จ
เปิด Network > request `void_sale_phase_9_2` และดู Response error เพราะ Version นี้คืนหน้า Void ที่ขาดแล้ว แต่ RPC เดิมในฐานข้อมูลยังต้องมีและทำงานถูกต้อง
