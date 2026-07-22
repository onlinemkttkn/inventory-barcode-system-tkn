# TKN POS / ERP — Version 2.0 Stable

## ภายในแพ็ก

- Dashboard หลักแบบ Unified
- POS ขายหน้าร้าน
- CSS POS ใหม่แบบ Responsive
- รับเงินอัตโนมัติตามยอดสุทธิ
- เงินทอนแบบ Real-time
- ค้นหาบิลย้อนหลัง
- คืนสินค้า
- ประวัติคืนสินค้า
- พิมพ์ใบคืนสินค้า
- รายงานคืนสินค้า
- Navigation แบบเส้นทางตายตัว
- SQL สำรอง Phase 9.2

## วิธีติดตั้ง

1. สำรอง Repository หรือดาวน์โหลด ZIP จาก GitHub ก่อน
2. แตก ZIP นี้
3. อัปโหลดไฟล์และโฟลเดอร์ทั้งหมดเข้า root ของ Repository
4. ยืนยันเขียนทับไฟล์ชื่อซ้ำ
5. Commit:

```text
Deploy TKN POS ERP Version 2.0 Stable
```

6. รอ GitHub Pages 1–3 นาที
7. เปิด:

```text
https://onlinemkttkn.github.io/inventory-barcode-system-tkn/dashboard.html
```

8. กด `Ctrl + Shift + R`

## SQL

ถ้า Phase 9.2 ใช้งานได้อยู่แล้ว ไม่ต้องรัน SQL ซ้ำ
โฟลเดอร์ `sql` เป็นชุดสำรองสำหรับฐานข้อมูลใหม่

## ไฟล์ที่ระบบยังใช้จาก Repository เดิม

- `js/supabase-config.js`
- `js/supabase-client.js`
- `products-admin.html`
- `product-stock-admin.html`
- โมดูลคลัง/สมาชิก/จัดซื้อเดิม

## หมายเหตุ

`pos-fixed.js` ไม่ใช่ไฟล์ Active อีกต่อไป
ไฟล์ Active คือ:

```text
pos.html
pos.css
pos.js
```
