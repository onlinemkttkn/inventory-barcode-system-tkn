# UAT v5.29.0 — 5 นาที

1. เปิด `stock-intake.html`
   - หน้า UI ต้องขึ้นทันที
   - ข้อความจะเปลี่ยนเป็น “พร้อมสแกน QR กล่อง” หลัง auth ผ่าน
   - ห้ามมี spinner เต็มหน้าค้าง

2. USB Scanner
   - วาง cursor นอกช่องหรือในช่องสแกน
   - ยิงรหัส
   - ระบบต้องส่งค่าเข้าช่องสแกนและทำ action เดิมของหน้านั้นทันที

3. Mobile
   - กด “สแกนกล้อง” หรือปุ่มสแกนของหน้า
   - อนุญาต Camera
   - QR/Barcode ต้องส่งเข้า flow เดิม

4. ทดสอบอย่างน้อย:
   - Stock Intake
   - คัดแยก/ปิดกล่อง
   - Box QR
   - POS
   - ตรวจนับ

5. Cache
   - DevTools > Network เปิด `Disable cache` ไม่จำเป็นแล้ว
   - service worker ที่ active ควรเป็น `service-worker-v5.29.0.js`

6. Protected
   - โปรโมชั่นสินค้าใช้งานเหมือนเดิม
   - พิมพ์ QR / ป้ายสินค้าใช้งานเหมือนเดิม
