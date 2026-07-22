# UAT — Master 3.0 LTS

## Login & Role
- [ ] Owner/Admin/Secretary เปิด Dashboard ได้
- [ ] Cashier/Staff ถูกส่งไป POS
- [ ] Warehouse ถูกส่งไปหน้าสต็อก
- [ ] Accounting ถูกส่งไปหน้าค้นหาบิล

## Navigation
- [ ] ทุกหน้าเปิดหน้าหลักตาม Role
- [ ] URL Dashboard เก่า Redirect มาหน้าใหม่
- [ ] ไม่มีหน้าใดโหลด Dashboard รุ่นเก่า

## Bill
- [ ] ค้นหาบิลได้
- [ ] เปิดรายละเอียดบิลได้
- [ ] ปุ่มยกเลิกแสดงเฉพาะ Role ที่อนุญาต
- [ ] Popup ยกเลิกเปิด หรือ fallback เปิดหน้าเดียวกัน
- [ ] ยกเลิกแล้วสถานะเป็น VOIDED
- [ ] คืนเฉพาะจำนวนที่ยังไม่เคยคืน
- [ ] บันทึก app_action_logs

## Stock
- [ ] Owner/Admin/Warehouse แก้จำนวนได้
- [ ] Role อื่นแก้ไม่ได้
- [ ] ต้องใส่เหตุผลอย่างน้อย 5 ตัวอักษร
- [ ] บันทึก app_action_logs

## POS
- [ ] รับเงินอัตโนมัติ
- [ ] เงินทอน Real-time
- [ ] ตัดสต็อกและออกใบเสร็จได้
