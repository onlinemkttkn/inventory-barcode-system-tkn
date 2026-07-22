# TKN POS / ERP — Master 3.2.1 Complete

เวอร์ชันนี้แก้ปัญหา Schema RBAC เดิมไม่ตรงกัน โดยไม่ใช้ตาราง
`app_roles`, `app_permissions`, `app_role_permissions` เดิมอีก

## ตารางมาตรฐานใหม่

- `tkn_roles`
- `tkn_permissions`
- `tkn_role_permissions`
- `tkn_user_access`
- `tkn_action_logs`

ข้อมูลเดิมไม่ถูกลบและไม่ถูกเขียนทับ

## 10 Roles มาตรฐาน

1. owner
2. admin
3. secretary
4. manager
5. supervisor
6. cashier
7. warehouse
8. purchasing
9. accounting
10. staff

## การติดตั้ง

1. อัปโหลดไฟล์ทั้งหมดทับ Master 3.1
2. รัน SQL เพียงไฟล์เดียว:

```text
sql/MASTER-3.2-COMPLETE.sql
```

3. ต้องขึ้น `Success. No rows returned`
4. เปิด `users-admin.html` ด้วย Owner/Admin
5. กำหนด Role ให้ผู้ใช้
6. กด Ctrl+Shift+R

## ห้ามรัน

ไม่ต้องรัน `MASTER-3.1-GOVERNANCE.sql` อีก
ไฟล์ดังกล่าวถูกย้ายไป docs และเปลี่ยนนามสกุลเป็น `.txt`

## ฟังก์ชันสำคัญ

- `current_access_context()`
- `user_has_permission(text)`
- `admin_list_users()`
- `admin_set_user_role(uuid,text,uuid,boolean)`
- `set_branch_product_stock(uuid,uuid,numeric,numeric,text)`
- `void_sale_phase_9_2(uuid,text)`
- `get_sales_control_dashboard_v2_1(text,date,uuid,integer)`


## กรณีเคยเจอ Error 42725

ถ้าเคยรัน Master 3.2 แล้วพบ:

```text
function public.user_has_permission(unknown) is not unique
```

ให้รัน:

```text
sql/FIX-3.2.1-USER-HAS-PERMISSION.sql
```

แล้วรัน `sql/MASTER-3.2-COMPLETE.sql` ฉบับ 3.2.1 ใหม่ตั้งแต่ต้น
