# TKN POS / ERP — Master 3.3 LTS

Master 3.3 LTS ใช้ระบบ RBAC จริงที่มีอยู่ในฐานข้อมูล:

- `app_roles.id` เป็น UUID
- `app_role_permissions.role_id` อ้างถึง `app_roles.id`
- `app_role_permissions.permission_id` อ้างถึง `app_permissions.id`
- `app_user_roles.role_id` อ้างถึง `app_roles.id`

ไม่มีการสร้างตาราง `tkn_*` และไม่ใช้ SQL รุ่น 3.1/3.2 อีก

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

## ติดตั้ง

1. สำรอง Repository และฐานข้อมูลก่อน
2. อัปโหลดไฟล์ทั้งหมดจาก ZIP เข้า Repository
3. Commit:

```text
Deploy TKN POS ERP Master 3.3 LTS
```

4. รัน SQL เพียงไฟล์เดียว:

```text
sql/MASTER-3.3-LTS.sql
```

5. ต้องขึ้น:

```text
Success. No rows returned
```

6. รันตรวจสอบ:

```text
sql/VERIFY-MASTER-3.3-LTS.sql
```

7. เปิด `users-admin.html` ด้วย Owner/Admin แล้วกำหนด Role
8. กด `Ctrl + Shift + R`

## ฟังก์ชันหลัก

- `user_has_permission(text,uuid)`
- `current_access_context()`
- `admin_list_users()`
- `admin_set_user_role(uuid,text,uuid,boolean)`
- `set_branch_product_stock(uuid,uuid,numeric,numeric,text)`
- `void_sale_phase_9_2(uuid,text)`
- `get_sales_control_dashboard_v2_1(text,date,uuid,integer)`

## ข้อกำหนดหลังจากนี้

ทุก Phase ถัดไปต้องเริ่มจาก Master 3.3 LTS ชุดนี้เท่านั้น
และต้องใช้ `current_access_context()` เป็นแหล่งสิทธิ์เดียวของหน้าเว็บ
