# Phase 9.2 — Module 2.5 Void Bill

## ความสามารถ

- ยกเลิกบิลผ่าน RPC
- บังคับกรอกเหตุผล
- ป้องกันยกเลิกซ้ำ
- เปลี่ยนสถานะเป็น `VOIDED`
- บันทึก `voided_by`
- บันทึก Audit Log เมื่อ schema รองรับ
- Refresh หน้า Search Bill หลังสำเร็จ

## สำคัญมาก

เวอร์ชันนี้ยัง **ไม่คืนสต็อกอัตโนมัติ**

เหตุผลคือระบบมีตารางเกี่ยวกับสต็อกหลายชุด เช่น:

- stock_movements
- inventory
- branch_inventory
- stock_documents

จึงต้องตรวจ workflow เดิมก่อน เพื่อไม่ให้ยอดสต็อกซ้ำหรือผิดพลาด

## ติดตั้ง

1. รัน:

```text
sql/phase-9-2-void-bill.sql
```

2. อัปโหลด:

```text
phase-9-2-void-bill.html
css/phase-9-2-void-bill.css
js/phase-9-2-void-bill.js
```

3. แก้ Search Bill ตาม:

```text
docs/PATCH-SEARCH-BILL-VOID-BUTTON.md
```

4. Commit:

```text
Phase 9.2 - Add void bill foundation
```

## ทดสอบด้วยบิลทดลองเท่านั้น

- เลือกบิลที่ไม่ใช่ข้อมูลสำคัญ
- กรอกเหตุผล
- ยืนยัน
- ตรวจ `sales.status = VOIDED`
- ตรวจว่า Search Bill แสดงสถานะยกเลิก
- อย่าทดสอบกับบิลจริงที่ต้องใช้ทางบัญชี

## ขั้นต่อไป

Module 2.5.1 จะเชื่อมการคืนสต็อก หลังตรวจ schema ของ:

- `stock_movements`
- `branch_inventory`
- trigger/function ที่ระบบเดิมใช้อยู่
