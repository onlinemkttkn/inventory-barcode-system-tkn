# Phase 9.2 — Module 2.4 Reprint Receipt

## ความสามารถ

- พิมพ์ใบเสร็จย้อนหลังจากข้อมูลเดิม
- รองรับกระดาษ 80mm และ 58mm
- ไม่แก้ไขข้อมูล `sales` หรือ `sale_items`
- แสดงคำว่า `REPRINT`
- เตรียมบันทึก Audit Log
- เปิดหน้าพิมพ์แยกจากหน้า Search Bill

## ไฟล์

```text
phase-9-2-reprint-receipt.html
css/phase-9-2-reprint-receipt.css
js/phase-9-2-reprint-receipt.js
sql/phase-9-2-reprint-receipt.sql
docs/PATCH-SEARCH-BILL-REPRINT-BUTTON.md
```

## ติดตั้ง

1. รัน SQL:

```text
sql/phase-9-2-reprint-receipt.sql
```

2. อัปโหลด HTML, CSS และ JS ตามโฟลเดอร์

3. แก้ปุ่ม Reprint ใน:

```text
js/phase-9-2-bill-search.js
```

ตามไฟล์:

```text
docs/PATCH-SEARCH-BILL-REPRINT-BUTTON.md
```

4. Commit:

```text
Phase 9.2 - Add reprint receipt
```

5. รอ Deploy แล้วเปิด Search Bill

6. กดดูรายละเอียด → พิมพ์ใบเสร็จซ้ำ

## ทดสอบ

- หน้าใบเสร็จเปิดแท็บใหม่
- ข้อมูลหัวบิลถูกต้อง
- รายการสินค้าครบ
- ยอดสุทธิตรง
- เลือก 58mm/80mm ได้
- Print Preview ไม่มีส่วน Toolbar
- Console ไม่มี Error

## หมายเหตุ Audit Log

ฟังก์ชัน Audit เขียนไปที่ `audit_logs` ตามโครงสร้างทั่วไป
หากคอลัมน์ของตารางจริงต่างกัน ฟังก์ชันจะไม่ขัดขวางการพิมพ์
แต่ควรปรับ Schema Mapping ใน Module ถัดไป
