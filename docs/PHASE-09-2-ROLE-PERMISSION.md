# Phase 9.2 — Role & Permission Foundation

ชุดไฟล์นี้เป็นจุดเริ่มต้นสำหรับแยกปุ่มและเมนูตามฝ่าย โดยไม่เขียนทับไฟล์เดิมของโปรเจกต์

## ไฟล์

- `js/phase-9-2-permissions.js`  
  กำหนด Role, Action และฟังก์ชันซ่อน/ปิดปุ่มตามสิทธิ์

- `sql/phase-9-2-rbac.sql`  
  สร้างตาราง Role/Permission/User Role และฟังก์ชันตรวจสิทธิ์ใน Supabase

- `docs/PHASE-09-2-ROLE-PERMISSION.md`  
  คู่มือติดตั้งและแนวทางเชื่อมเข้าหน้าเดิม

## ขั้นตอนติดตั้ง

1. สำรองฐานข้อมูลและสร้าง Git branch ใหม่

```bash
git checkout -b phase-9-2-role-permission
```

2. คัดลอกไฟล์ไปยังโฟลเดอร์ชื่อเดียวกันในโปรเจกต์

3. เปิด Supabase SQL Editor แล้วตรวจสอบไฟล์ `sql/phase-9-2-rbac.sql`

4. รัน SQL ใน Development Project ก่อน Production

5. นำโมดูล JavaScript ไปใช้ในหน้าที่ต้องแยกปุ่ม

```html
<button data-permission="pos.sell">ขายสินค้า</button>
<button data-permission="pos.void_bill">ยกเลิกบิล</button>

<script type="module">
  import { applyPermissionUI } from './js/phase-9-2-permissions.js';

  const currentUserRole = 'cashier';

  applyPermissionUI({
    role: currentUserRole,
    root: document
  });
</script>
```

## Role เริ่มต้น

| Role | งานหลัก |
|---|---|
| Cashier | ขาย รับเงิน พักบิล ค้นบิล ขอส่วนลด |
| Supervisor | งาน Cashier + อนุมัติส่วนลด ยกเลิกบิล อนุมัติคืน |
| Accounting | ตรวจสลิป กระทบยอด ปิดรอบ ส่งออกรายงาน |
| Warehouse | รับ เบิก โอน ตรวจนับ |
| Sales | ลูกค้า ประวัติขาย Dashboard |
| Owner | ทุกสิทธิ์ |

## หลักความปลอดภัย

การซ่อนปุ่มในหน้าเว็บเป็นเพียงการควบคุม UX ไม่ใช่ระบบรักษาความปลอดภัยหลัก  
คำสั่งที่สำคัญต้องตรวจสิทธิ์ซ้ำที่ Backend, Database Function หรือ RLS ทุกครั้ง

## ขอบเขต Phase 9.2

- ใช้ธุรกิจปัจจุบันเป็นหลัก
- ยังไม่เปิดระบบหลายสาขา
- ไม่เพิ่ม Dynamic QR หรือ Payment Gateway จริงในชุดนี้
- เตรียมโครงสร้างให้เพิ่มความสามารถได้ภายหลัง
