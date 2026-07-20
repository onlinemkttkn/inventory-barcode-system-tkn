# Phase 9.2 — Module 2.6.1 Sales Return Foundation

## สิ่งที่ได้ในชุดนี้

- หน้า `sales-return.html` เปิดจากปุ่มคืนสินค้าได้
- รับ `sale_id` และ `sale_no` จาก URL
- โหลดหัวบิลและรายการสินค้าจริงผ่าน `get_sale_receipt_phase_9_2`
- เลือกจำนวนสินค้าที่ต้องการคืน
- คำนวณยอดคืนโดยประมาณ
- ป้องกันคืนสินค้าจากบิล `VOIDED`
- มี SQL ตรวจโครงสร้างฐานข้อมูลแบบ Read Only

## ยังไม่ทำในรอบนี้

ปุ่มยืนยันยังปิดไว้ เพราะต้องเห็น schema จริงของ:

- `sales_returns`
- `sales_return_items`
- `sale_item_return_balance`

ก่อนเขียน RPC บันทึกจริงและคืนสต็อก

## ขั้นตอนติดตั้ง

1. อัปโหลด:

```text
sales-return.html
css/phase-9-2-sales-return.css
js/phase-9-2-sales-return.js
```

2. Commit:

```text
Phase 9.2 - Add sales return foundation
```

3. เปิด Supabase SQL Editor แล้วรัน:

```text
sql/phase-9-2-sales-return-schema-inspection.sql
```

4. ส่งภาพผลลัพธ์ Columns, Foreign Keys, Triggers และ Functions มา

## ทดสอบหน้าเว็บ

```text
ค้นหาบิล
→ ดูรายละเอียด
→ คืนสินค้า
```

URL ต้องเป็น:

```text
sales-return.html?sale_id=<uuid>&sale_no=<sale_no>
```

และต้องแสดงรายการสินค้าในบิล
