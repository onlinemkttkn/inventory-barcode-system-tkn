# Phase 7 — Inventory Operations

Phase 7 เพิ่มระบบคลังสินค้าใช้งานจริงบนระบบเดิม:

- รับสินค้าเข้า
- เบิก/จ่ายสินค้า
- ตรวจสอบยอดคงเหลือก่อนเบิก
- ป้องกันสต๊อกติดลบ
- เลขเอกสารอัตโนมัติจาก Phase 5
- บันทึก Supplier, Invoice, ผู้เบิก, แผนก และหมายเหตุ
- ประวัติเอกสารรับเข้า/เบิกจ่าย
- รองรับมือถือ คอมพิวเตอร์ GitHub Pages และ Supabase
- ใช้บัญชีองค์กรและ RLS เดิม

## ขั้นตอนติดตั้ง

1. แตกไฟล์ ZIP
2. เปิด `sql/phase07.sql`
3. คัดลอก SQL ทั้งหมดไปที่ Supabase → SQL Editor → Run
4. ตรวจสอบ `js/supabase-config.js`
5. เปิด `index.html` ผ่าน Live Server
6. ทดสอบหน้า:
   - `receive.html`
   - `issue.html`
   - `transactions.html`
7. อัปโหลดไฟล์ทั้งหมดทับ Repository เดิมบน GitHub

## สำคัญ

ต้องติดตั้ง Phase 1–6.5 และ Phase 5 ระบบ Stock Movement มาก่อน
