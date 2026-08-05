# Box QR Workflow Cleanup v5.24.1

## ผลการตรวจสอบก่อนแก้ไข

- หน้าใช้งานจริง `box-qr-stock.html` เรียก `js/box-qr-stock-v5-20-6.js`
- `service-worker-v5.20.6.js` แคช JavaScript ตัวเดียวกัน
- `box-qr-stock-v5-20-6.js` ที่โฟลเดอร์รากเป็นไฟล์ซ้ำและไม่มีหน้าใดเรียกใช้
- `css/box-qr-preview-v5-20-6.css` ใช้เฉพาะส่วนตัวอย่างฉลากสินค้าที่ต้องตัดออก
- `css/box-qr-stock-v5-20-3.css` ยังถูก Service Worker รุ่นเก่า 5.20.3–5.20.5 อ้างอิง จึงเก็บไว้เพื่อความเข้ากันได้ และสร้าง CSS รุ่นใหม่สำหรับหน้าปัจจุบันแทน

## อัปเดต

- ลดขั้นตอนจาก 6 เหลือ 5 ขั้นตอน: รับคืนหน้าร้าน → จัดกล่อง → ตรวจนับ → ปิดกล่องและ QR → ประวัติ
- ตัดขั้นตอนฉลากสินค้า คิวพิมพ์สินค้า และการตั้งค่าเครื่องพิมพ์ฉลากออกจากหน้า Box QR
- หลังยืนยันตรวจนับ ระบบไปหน้าปิดกล่องโดยตรง
- ปิดกล่องแล้วสร้าง QR กล่องในหน้าสุดท้าย และมีปุ่มพิมพ์ QR กล่องเฉพาะกล่องที่ปิดแล้ว
- ตัดการเขียน/อ่าน `label_print_queue` ออกจากโมดูล Box QR แต่ไม่ลบตารางหรือระบบพิมพ์ฉลากส่วนกลางของหน้าอื่น
- เปลี่ยนไฟล์ใช้งานจริงเป็น `js/box-qr-stock-v5-24-1.js` และ `css/box-qr-stock-v5-24-1.css`
- ปรับ Service Worker เป็น cache version 5.24.1
- เพิ่ม favicon SVG เพื่อลดข้อผิดพลาด favicon 404

## ลบแล้วหลังตรวจสอบว่าไม่มีการอ้างอิงที่จำเป็น

- `js/box-qr-stock-v5-20-6.js`
- `box-qr-stock-v5-20-6.js`
- `css/box-qr-preview-v5-20-6.css`
- `box-qr-preview-v5-20-6.css`

## เก็บไว้โดยตั้งใจ

- `css/box-qr-stock-v5-20-3.css` เพราะ Service Worker รุ่นเก่ายังอ้างอิง
- `print-labels.html`, `print-labels.js`, `print-labels.css` และตาราง `label_print_queue` เพราะเป็นโมดูลพิมพ์ฉลากอิสระของระบบ
- ไฟล์ Box QR รุ่นเก่ากว่า v5.20.6 ใน `js/` เพื่อใช้เป็นประวัติ/ย้อนเวอร์ชัน และไม่ได้ถูกหน้าปัจจุบันเรียก

## การตรวจสอบที่ผ่าน

- JavaScript syntax check ผ่าน
- Service Worker syntax check ผ่าน
- ทุกไฟล์ในรายการ cache ของ Service Worker มีอยู่จริง
- ทุก DOM ID ที่ JavaScript ผูก event มีอยู่ใน HTML
- ทดสอบ initialization ด้วย mock DOM/Supabase: ไม่มี warning “ไม่พบ #...”
- ทดสอบ flow: ยืนยันตรวจนับ → หน้าปิดกล่อง → ปิดกล่อง → สร้าง QR กล่อง ผ่าน
- ยืนยันว่า flow Box QR ใหม่ไม่เรียก `label_print_queue`
