# Phase 9.2 — Module 2.6.2 Final Sales Return

## ความสามารถ

RPC `process_sale_return_phase_9_2` ทำงานใน Transaction เดียว:

1. ตรวจบิลและสถานะ
2. ตรวจจำนวนที่เคยคืนแล้ว
3. ป้องกันคืนเกิน `returnable_quantity`
4. สร้าง `sales_returns`
5. สร้าง `sales_return_items`
6. สร้าง Stock Document ประเภท RECEIVE
7. เพิ่มยอดกลับ `branch_inventory`
8. เพิ่ม `stock_movements`
9. เปลี่ยนสถานะบิลเป็น:
   - `PARTIAL_RETURN`
   - `RETURNED`
10. ส่งผลกลับหน้าเว็บและกลับหน้า Search Bill

## ขั้นตอนติดตั้ง

### 1. สำรองข้อมูล

Export ตาราง:

- sales
- sale_items
- sales_returns
- sales_return_items
- branch_inventory
- stock_documents
- stock_movements

### 2. รัน SQL

Supabase → SQL Editor:

```text
sql/phase-9-2-process-sale-return.sql
```

ต้องขึ้น `Success`

### 3. อัปโหลด JavaScript

ใช้ไฟล์:

```text
js/phase-9-2-sales-return.js
```

ทับไฟล์เดิมใน GitHub

Commit:

```text
Phase 9.2 - Enable final sales return transaction
```

### 4. ทดสอบด้วยบิลทดลอง

```text
ค้นหาบิล
→ ดูรายละเอียด
→ คืนสินค้า
→ เลือกจำนวน
→ ระบุเหตุผล
→ เลือกวิธีคืนเงิน
→ ยืนยันคืนสินค้า
```

### 5. ตรวจฐานข้อมูล

ใช้ไฟล์:

```text
sql/phase-9-2-sales-return-validation.sql
```

แก้ `RETURN_NO` และ `SALE_UUID` ก่อนรัน

## ข้อควรระวัง

- ทดสอบด้วยบิลทดลองก่อน
- ห้ามปรับสต็อกด้วยมือพร้อมกับ RPC
- ถ้าเลือก `คืนตามช่องทางเดิม` ระบบจะใช้ payment method ของบิล
- ถ้า enum `refund_method` ไม่มีค่าบางชนิด ระบบจะแจ้ง
  `UNSUPPORTED_REFUND_METHOD`
