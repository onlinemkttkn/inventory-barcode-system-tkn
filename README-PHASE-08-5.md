# Phase 8.5 — System Config + Import / Export

## ความสามารถ

- Supabase Config กลางสำหรับทุกหน้า
- ใส่ Project URL และ Publishable Key พร้อมใช้
- Session คงอยู่หลังรีเฟรช
- ต่ออายุ Token อัตโนมัติ
- ตรวจสอบกรณีลืมใส่ Key
- ป้องกันนำ Secret Key ไปใส่หน้าเว็บ
- เพิ่ม Cache Version สำหรับ GitHub Pages
- ดาวน์โหลด CSV Template
- ตรวจสอบข้อมูลก่อน Import
- ตรวจรหัสสินค้าและบาร์โค้ดซ้ำ
- ตรวจหมวดหมู่ หน่วย ยี่ห้อ และสาขา
- Import สินค้าเข้า Supabase
- Export สินค้าทั้งหมดเป็น CSV
- แสดงผลสำเร็จและข้อผิดพลาดรายแถว

## วิธีติดตั้ง

1. รัน `sql/phase08_5.sql` ใน Supabase SQL Editor
2. ตรวจสอบ `js/supabase-config.js`
3. เปิด `index.html` ผ่าน Live Server
4. เปิด `import-export.html`
5. ดาวน์โหลด Template
6. กรอกข้อมูลและบันทึกเป็น CSV UTF-8
7. ตรวจสอบข้อมูลก่อนกด Import
8. อัปโหลดไฟล์ทั้งหมดทับ Repository เดิม

## หัวคอลัมน์ Template

- product_code
- product_name
- barcode
- category_code
- unit_name
- brand_code
- cost_price
- selling_price
- minimum_stock
- vat_rate
- initial_branch_code
- initial_quantity
- description

## หมายเหตุ

Publishable Key สามารถอยู่ในหน้าเว็บได้ เพราะสิทธิ์ข้อมูลถูกควบคุมด้วย Supabase Auth และ RLS
ห้ามใส่ `sb_secret_...` หรือ Service Role Key ลง GitHub
