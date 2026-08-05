# วิธีอัปเดต Box QR v5.24.1

## 1) อัปโหลด/แทนที่ไฟล์

- `box-qr-stock.html`
- `service-worker-v5.20.6.js`
- `VERSION.txt`
- `js/box-qr-stock-v5-24-1.js`
- `css/box-qr-stock-v5-24-1.css`

## 2) ลบไฟล์เก่าหลังอัปโหลดไฟล์ใหม่ครบ

- `js/box-qr-stock-v5-20-6.js`
- `box-qr-stock-v5-20-6.js`
- `css/box-qr-preview-v5-20-6.css`
- `box-qr-preview-v5-20-6.css`

ห้ามลบ `css/box-qr-stock-v5-20-3.css` เพราะ Service Worker รุ่นเก่ายังอ้างอิงเพื่อรองรับผู้ใช้ที่ยังมี cache เก่า

## 3) หลัง Deploy

1. เปิดหน้า Box QR
2. กด `Ctrl + Shift + R`
3. ตรวจ Console ว่าไม่มีข้อความ `ไม่พบ #refreshPrintBtn` หรือ ID ฉลากสินค้าอื่น
4. ทดสอบลำดับ: รับคืน → จัดกล่อง → ตรวจนับ → ปิดกล่องและ QR → ประวัติ
5. ปิดกล่องแล้วตรวจว่าปุ่ม `พิมพ์ QR กล่อง` เปิดใช้งาน

Service Worker ใช้ cache version 5.24.1 แล้ว หากหน้าเดิมยังค้าง ให้เปิด DevTools → Application → Service Workers → กด Update แล้วรีเฟรชอีกครั้ง
