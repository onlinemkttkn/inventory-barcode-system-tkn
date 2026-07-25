# Master 3.5.0 — Dashboard Stable Update

## ขอบเขต

อัปเดตเฉพาะ Dashboard:

- `dashboard.html`
- `js/dashboard.js`
- `js/executive-report.js`
- `css/dashboard-v2.css`
- `css/executive-report.css`

## สิ่งที่แก้

- ใช้ Supabase Client กลางเพียงตัวเดียว
- ลดปัญหา Multiple GoTrueClient และ Session เด้ง
- ไม่ Sign out อัตโนมัติเมื่อ RPC ตรวจสิทธิ์มีปัญหาชั่วคราว
- โหลดรายงานหลัง Dashboard ยืนยัน Session แล้ว
- ป้องกัน Request รายงานเก่าทับข้อมูลใหม่
- ถ้า Chart.js โหลดไม่ได้ ตารางและ KPI ยังใช้งานได้
- เพิ่มทางลัด Reports และตรวจสอบบิล
- ปรับ Responsive สำหรับมือถือและ Tablet

## ไม่ได้แก้

- POS (`pos.html`, `pos.js`, `pos.css`)
- Receipt / Payment / Shift / Drawer / Hardware
- Database / SQL / RPC / RLS
- Reports page และ Bill Search page

## วิธีอัป

1. สำรอง Commit ปัจจุบัน
2. อัปโหลดไฟล์ในแพ็กไปที่ root ของ Repository
3. รักษาโครงสร้าง `js/` และ `css/`
4. Commit:

`Deploy Master 3.5.0 Dashboard Stable Update`

5. รอ Deploy
6. กด `Ctrl + Shift + R`

ไม่ต้องรัน SQL
