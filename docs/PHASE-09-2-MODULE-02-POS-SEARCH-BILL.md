# Phase 9.2 — Module 02
## POS Search Bill System

Feature Pack นี้เพิ่มหน้า `phase-9-2-bill-search.html` เพื่อค้นหาบิลย้อนหลังโดยไม่เขียนทับ `sales-history` เดิม

## ไฟล์

```text
phase-9-2-bill-search.html
css/phase-9-2-bill-search.css
js/phase-9-2-bill-search.js
sql/phase-9-2-search-bill-foundation.sql
docs/PHASE-09-2-MODULE-02-POS-SEARCH-BILL.md
PHASE-09-2-MODULE-02-MANIFEST.json
```

## ขั้นตอนติดตั้ง

1. สร้าง Branch ใหม่

```bash
git checkout -b phase-9-2-pos-search-bill
```

2. คัดลอกไฟล์เข้ารากโปรเจกต์ตามโฟลเดอร์เดิม

3. ตรวจว่ามีไฟล์จาก Module 1 อยู่แล้ว:

```text
js/phase-9-2-permissions.js
```

4. เปิดหน้า:

```text
phase-9-2-bill-search.html
```

หน้าแรกจะใช้ Demo Data เพื่อให้ตรวจ UI และ Permission ได้ทันที

5. ทดสอบ Role ผ่าน Console:

```javascript
sessionStorage.setItem('tkn_user_role', 'cashier')
location.reload()
```

หรือ:

```javascript
sessionStorage.setItem('tkn_user_role', 'supervisor')
location.reload()
```

6. ยังไม่ต้อง Run SQL ในไฟล์ `phase-9-2-search-bill-foundation.sql`

ไฟล์ SQL ถูก Comment ไว้ทั้งหมด เพราะต้องตรวจชื่อตารางเดิมก่อน เช่น `transactions`, `sales_history`, `transaction_items` หรือชื่อที่ระบบใช้อยู่จริง

## สิ่งที่ทดสอบได้ทันที

- ค้นหาเลขบิล
- ค้นหา SKU, Barcode และชื่อสินค้า
- เลือกช่วงวันที่
- เลือก Sales Channel
- เลือก Payment Channel
- เลือกสถานะ
- เปิดรายละเอียดบิล
- แสดง Walk-in
- ซ่อนปุ่มคืนสินค้า/พิมพ์ซ้ำตาม Permission

## การเชื่อมเมนู

เมื่อตรวจหน้าใหม่ผ่านแล้ว ค่อยเพิ่มลิงก์ใน `pos.html` หรือ `sales-history.html`:

```html
<a href="./phase-9-2-bill-search.html"
   data-permission="pos.search_bill">
  ค้นหาบิลย้อนหลัง
</a>
```

## เกณฑ์ผ่าน Module 02 UI

- หน้าเปิดได้โดยไม่มี JavaScript Error
- ค้นหา Demo Data ได้
- Cashier เห็นเฉพาะปุ่มตาม Permission
- Supervisor เห็นปุ่มอนุมัติที่กำหนดไว้
- หน้า Responsive บน Desktop และ Tablet
- ยังไม่มีไฟล์เดิมถูกเขียนทับ
