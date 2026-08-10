# UAT v5.30.9

1. Preflight PASS และ BLOCKER No rows
2. Install SQL
3. Verify RPC = PASS ทุกข้อ
4. อัป Frontend / ปิดแท็บเก่า / เปิดใหม่
5. ใช้กล่อง UAT ที่ SKU ยังไม่มีใน products
6. กดปิดกล่อง
7. ระบบต้องสร้าง Product master ของ SKU ใหม่
8. products.quantity ต้องเป็น 0
9. กล่องต้องได้ WAITING_STOCK
10. Stock Intake ต้องเห็นกล่องและ Snapshot
11. ก่อนกดรับเข้า branch_inventory ห้ามเพิ่ม
12. กดรับเข้า 1 ครั้ง → branch_inventory เพิ่มตาม Snapshot
13. รับซ้ำ → จำนวนห้ามเพิ่มซ้ำ
