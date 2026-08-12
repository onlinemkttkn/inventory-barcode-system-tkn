# UAT v5.31.2 — No Shelf Putaway

1. รัน `00-PREFLIGHT-v5.31.2-READ-ONLY.sql` → ต้อง PASS 3/3
2. อัปโหลดไฟล์ในแพ็กทับโครงสร้างเดิม แล้ว Deploy
3. ปิดแท็บ/PWA เก่า เปิดใหม่; Desktop ทำ Hard Refresh 1 ครั้ง
4. ศูนย์คลังต้องไม่มีคำ/ปุ่ม “ขึ้นชั้นจัดเก็บ” และต้องไม่เรียก RPC putaway ใน Network
5. เปิด `storage-locations.html` เก่า → ต้อง redirect ไป Box Inspection
6. เปิด `stock-putaway.html` เก่า → ต้อง redirect ไป Box Inspection
7. รับกล่อง WAITING_STOCK 1 กล่อง → Stock เพิ่มเพียงครั้งเดียว
8. หลังรับเข้า ปุ่ม “ตรวจสอบกล่อง” ต้องแสดงและพาไปกล่องเดียวกัน
9. Reload หน้า Stock Intake แล้วสแกนกล่องที่รับเข้าแล้ว → ปุ่ม “ตรวจสอบกล่อง” ต้องยังแสดง
10. Box Inspection ต้องผ่านสิทธิ์ `inventory.receive`; สแกน USB และกล้องมือถือได้
11. Box Inspection ต้องแสดง Snapshot + เอกสารรับเข้า และห้ามมี RPC เพิ่ม/ลด Stock
12. จำนวน Stock ก่อน/หลังสแกน Box Inspection ต้องเท่าเดิม
13. รัน `01-VERIFY-v5.31.2-READ-ONLY.sql` → PASS
