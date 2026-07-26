# PHASE 07.6C — รับเข้า/เบิกออกแบบแยกสาขา

## ไฟล์หน้าเว็บที่ปรับ

- `receive.html`
- `issue.html`
- `js/receive.js`
- `js/issue.js`
- `js/inventory-branch-common.js`
- `receive.js` และ `issue.js` เปลี่ยนเป็น compatibility loader

## สิ่งที่เปลี่ยน

1. เพิ่มช่องเลือกสาขาในหน้ารับเข้าและเบิกออก
2. ค้นหาจำนวนจาก `branch_inventory_list` ตามสาขาที่เลือก
3. รับเข้าเรียก `receive_branch_inventory`
4. เบิกออกเรียก `issue_branch_inventory`
5. ส่ง `p_branch_id` และ `p_idempotency_key` ทุกครั้ง
6. เปลี่ยนสาขาแล้วล้างตะกร้า ป้องกันข้อมูลข้ามสาขา
7. ตรวจ Permission `inventory.receive` / `inventory.issue` ก่อนเปิดหน้า
8. ใช้ `try/catch/finally` ป้องกันปุ่มบันทึกค้าง
9. เมื่อเครือข่ายผิดพลาด สามารถกดซ้ำโดยใช้ Idempotency Key เดิม

## ลำดับติดตั้ง

1. รัน `sql/PHASE-07-6C-RECEIVE-ISSUE-PERMISSIONS.sql` ใน Supabase SQL Editor
2. รัน `sql/VERIFY-PHASE-07-6C.sql`
3. อัปโหลดไฟล์เว็บชุดนี้ทับของเดิม
4. ล้าง Cache ของ Hosting/Cloudflare และ Refresh แบบ Ctrl+F5
5. ทดสอบตาม `UAT-PHASE-07-6C.md`

> ยังไม่ต้องรันไฟล์ RESET STOCK TO ZERO ในขั้นตอนนี้
