# TKN v5.29.0 FINAL — Startup / Cache / Unified Scanner

ฐานที่ใช้ตรวจและพัฒนา: `inventory-barcode-system-tkn-main (29).zip`

## แก้ปัญหาหลัก
- Stock Intake ไม่ใช้ Full-screen `tkn-auth-loading` ตั้งแต่เริ่มหน้าอีกต่อไป
- สิทธิ์ `inventory.receive` ยังถูกตรวจ แต่ไม่บล็อกการ render หน้าด้วย spinner
- โหลด Branch / WAITING_STOCK / Recent แบบ background หลังยืนยันสิทธิ์
- Auth Guard มี timeout ภายในสำหรับ Session / permission RPC และมี watchdog ป้องกัน spinner ค้างในหน้าอื่น
- Service Worker v5.29.0 เปลี่ยน JS/CSS เป็น **network-first** เพื่อไม่ให้ hotfix ถูก cache เก่าทับ
- Scanner กลางรองรับ:
  - เครื่องยิง USB / Bluetooth ที่ทำงานแบบ Keyboard Wedge
  - กล้องมือถือผ่าน BarcodeDetector
  - ZXing fallback
  - QR, Code 128/39, EAN, UPC, ITF, Codabar
  - haptic/beep และ duplicate lock
- หน้าสแกนสำคัญถูกประกาศ `data-tkn-scan` ให้ behavior ตรงกันทั้งระบบ

## หน้าที่อัปเดต Scanner
Stock Intake, Box QR, คัดแยก/ปิดกล่อง, POS, รับสินค้า, เบิกสินค้า, โอนสินค้า,
ตรวจนับสต็อก, Mobile Stock Check, Scanner, จัดการสินค้า (Barcode field),
Purchase Order และ Sales Return

## ไฟล์ที่ยืนยันว่าไม่ได้แก้
- `stock-promotions.html`
- `js/stock-promotions-v5-25-0.js`
- `print-labels.html`

ดู hash ยืนยันได้ใน `PRE-SEND-AUDIT-v5.29.0.json`

## ฐานข้อมูล
Patch นี้ **ไม่มี SQL** และไม่แก้ตาราง/สต็อก/ยอดขาย

## วิธีอัปเดต
1. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์ `v5.29.0` ทับ path เดิม
2. ต้องอัปโหลด `service-worker-v5.29.0.js` ด้วย
3. รอ GitHub Pages Deploy
4. เปิดหน้าใดก็ได้ในชุดสแกน แล้ว Refresh 1 ครั้ง
5. ถ้า Browser เคยเปิดระบบค้างไว้นาน ให้ปิดแท็บระบบทั้งหมดแล้วเปิดใหม่
6. ทดสอบ Stock Intake ก่อน: หน้า **ต้องแสดงทันที** ไม่ค้าง spinner
7. ยิง USB ที่ช่องสแกน และทดลองปุ่มกล้องมือถือ

## เกณฑ์ Final
รายงาน Pre-send Audit ต้อง `all_pass = true`
