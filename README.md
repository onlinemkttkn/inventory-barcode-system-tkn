# เฟส 6.5 — Integrated Dashboard

รวมระบบเฟส 6.1–6.4 ในโปรเจกต์เดียว:

- Dashboard สรุปสินค้า หมวดหมู่ และสต๊อก
- สแกนบาร์โค้ดด้วยกล้องมือถือ
- ค้นหาสินค้าด้วยบาร์โค้ด
- สร้าง Barcode Code128 และ QR Code
- พิมพ์ป้าย A4, 58/80 มม.
- รองรับ PeriPage และเครื่องพิมพ์พกพา
- ดาวน์โหลดและแชร์ PNG
- ระบบปิด ต้อง Login และบัญชี `is_active = true`
- รองรับ Visual Studio Code และ GitHub Pages

## ติดตั้ง

1. รัน `sql/phase06_5.sql` ใน Supabase SQL Editor
2. ตรวจสอบ `js/supabase-config.js`
3. เปิดโฟลเดอร์ใน Visual Studio Code
4. คลิกขวา `index.html` → Open with Live Server
5. ทดสอบ Login และทุกเมนู
6. อัปโหลดไฟล์ทั้งหมดขึ้น GitHub Pages

## GitHub Pages

`index.html` จะเปิด `dashboard.html` อัตโนมัติ และทุกลิงก์ใช้ Relative Path จึงรองรับ Repository URL

## ความปลอดภัย

- ปิด Sign ups ใน Supabase
- Admin เป็นผู้สร้างบัญชีพนักงาน
- ใช้ Publishable Key เท่านั้น
- ห้ามใส่ Secret Key หรือ service_role
- RLS จากเฟส 4–5 ยังคงควบคุมข้อมูล
