# TKN POS / ERP — MASTER VERSION 3.0

ชุดนี้สร้างจาก ZIP ล่าสุดของ Repository ที่ใช้งานจริง และเป็นฐานหลักเพียงชุดเดียว

## สิ่งที่แก้

- Dashboard หลักเหลือ `dashboard.html` เพียงหน้าเดียว
- Dashboard รุ่นเก่าทุกหน้าจะ Redirect มาหน้าหลัก
- แก้ทุกลิงก์ Dashboard ใน HTML/JS ให้ชี้มาที่ `dashboard.html`
- แก้ปุ่มยกเลิกบิลที่กดแล้วไม่ทำงาน
- หน้าค้นหาบิลใช้ `js/phase-9-2-bill-search.js` ตัว Canonical
- Role Dashboard:
  - owner / admin / secretary เห็น Dashboard ทั้งหมด
  - warehouse ไปหน้าสต็อก
  - cashier / staff / manager / supervisor / sales ไป POS
  - accounting ไปหน้าค้นหาบิล
- สิทธิ์ยกเลิกบิล:
  - owner / admin / manager / supervisor
- สิทธิ์ปรับสต็อก:
  - owner / admin / warehouse
- บังคับเหตุผลอย่างน้อย 5 ตัวอักษรในการยกเลิกบิลและปรับสต็อก
- ตรวจสิทธิ์ทั้ง JavaScript และ Supabase RPC

## ติดตั้ง

1. สำรอง Repository เดิมด้วย Download ZIP
2. แตกไฟล์ MASTER VERSION 3.0
3. อัปโหลดไฟล์ทั้งหมดเข้า root ของ Repository
4. ยืนยันเขียนทับไฟล์ชื่อซ้ำ
5. รัน SQL:

```text
sql/00-MASTER-VERSION-3-0.sql
```

6. Commit:

```text
Deploy TKN POS ERP Master Version 3.0
```

7. เปิด:

```text
https://onlinemkttkn.github.io/inventory-barcode-system-tkn/dashboard.html
```

8. กด Ctrl + Shift + R

## ไฟล์หลักหลังจากนี้

```text
dashboard.html
pos.html
phase-9-2-bill-search.html
phase-9-2-void-bill.html
product-stock-admin.html
products-admin.html
sales-return.html
```

ไฟล์ Dashboard รุ่นเก่าจะ Redirect มาหน้าหลักและไม่ควรใช้พัฒนาต่อ
