# Master 3.1 Governance & Control

ฐานมาตรฐานตั้งแต่เวอร์ชันนี้:

## 10 Roles

1. owner — เจ้าของกิจการ
2. admin — ผู้ดูแลระบบ
3. secretary — เลขานุการ
4. manager — ผู้จัดการสาขา
5. supervisor — หัวหน้างาน
6. cashier — แคชเชียร์
7. warehouse — คลังสินค้า
8. purchasing — จัดซื้อ
9. accounting — บัญชี
10. staff — พนักงาน

## ฟังก์ชันหลัก

- ยกเลิกบิลพร้อมคืนสต็อกและ Action Log
- RBAC ตรวจสิทธิ์จากฐานข้อมูล
- ปรับสต็อกพร้อมเหตุผลและ Action Log
- Dashboard ตาม Role
- รายงานวัน/เดือน/ปี, แยกช่องทางชำระ, รายละเอียดสินค้า
- Export CSV และพิมพ์
- หน้าจัดการผู้ใช้และ Role

## ติดตั้ง

1. อัปโหลดไฟล์ทั้งหมดทับ Master 3.0 LTS
2. รัน SQL:

```text
sql/MASTER-3.1-GOVERNANCE.sql
```

3. เปิด `users-admin.html` ด้วย Owner/Admin เพื่อกำหนด Role
4. กด Ctrl+Shift+R

## หมายเหตุ

ใช้ `app_user_roles` เป็นแหล่งสิทธิ์หลัก โดยยัง fallback จาก `profiles.role`
สำหรับบัญชีเดิมที่ยังไม่ได้กำหนด Role ในหน้าใหม่
