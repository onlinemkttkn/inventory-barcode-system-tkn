# Database Safety Audit — v5.26.2

## ผลกระทบขณะติดตั้ง

ไฟล์ติดตั้ง `03-HOTFIX-v5.26.2-CASHIER-POS-INLINE.sql` ทำงานใน Transaction เดียวและเพิ่มเฉพาะวัตถุใหม่:

- `public.tkn_v5262_box_sale_draft_shifts`
- `public.tkn_v5262_cashier_box_sale_access(...)`
- `public.tkn_v5262_cashier_box_sale_assert(...)`
- ฟังก์ชัน Workflow ที่ขึ้นต้น `public.tkn_v5262_box_sale_*`

ไม่มีการเปลี่ยน Schema ของตารางหลัก และไม่มี Trigger/Policy ใหม่บน:

- `stock_boxes`
- `stock_box_items`
- `branch_inventory`
- `sales`
- `sale_items`
- ตารางโอนสินค้าเดิม

ไม่มีการย้าย แก้ หรือลบข้อมูลเดิมขณะติดตั้ง

## ผลกระทบขณะใช้งาน

- การสร้าง Draft เพิ่มข้อมูลเฉพาะตาราง v5.26.1/v5.26.2 ที่ออกแบบสำหรับขายยกกล่อง
- การสแกนกล่องสร้าง Snapshot ต้นทุนและราคาสำหรับ Draft
- การกดยืนยันขายเรียก `create_pos_sale` เดิมเพื่อตัดสต็อก และจึงปิดรอบกล่อง/ทำกล่องว่างใน Transaction เดียว
- ก่อนยืนยัน ระบบตรวจ Permission จากรหัสพนักงานที่เปิดกะ ตรวจสาขา สถานะกล่อง การโอน และ Hash รายการสินค้าอีกครั้ง

## ข้อจำกัดการตรวจ

แพตช์ผ่าน Static Audit, JavaScript Syntax, HTML Reference, Manifest/Service Worker Reference และ ZIP Integrity แล้ว แต่ไม่ได้รันคำสั่งกับ Production Supabase ของร้านจากสภาพแวดล้อมนี้ จึงต้องรัน Preflight และ Verify ในฐานจริงก่อนใช้งาน
