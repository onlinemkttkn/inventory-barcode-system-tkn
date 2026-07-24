# Master 3.4.10 — UI Logout + Mobile Camera Update

## ขอบเขต

- ตัดปุ่มออกจากระบบใน Header/เนื้อหาของหน้าเว็บ
- คงปุ่มออกจากระบบสีแดงใน Sidebar จาก `js/navigation.js`
- เพิ่มกล้องมือถือสำหรับ:
  - สแกนและค้นหาสินค้า
  - รับสินค้าเข้า
  - เบิกสินค้า
  - โอนสินค้าระหว่างสาขา
- ไม่แก้ฐานข้อมูล
- ไม่รัน SQL

## วิธีอัป

1. สำรอง Commit ปัจจุบัน
2. แตก ZIP
3. อัปโหลดไฟล์ทั้งหมดไปที่ root ของ Repository
4. รักษาโครงสร้าง `js/` และ `css/`
5. Commit:

`Deploy Master 3.4.10 UI logout and mobile camera`

6. รอ GitHub Pages Deploy
7. กด `Ctrl + Shift + R`

## เงื่อนไขกล้องมือถือ

- ต้องเปิดผ่าน HTTPS เช่น GitHub Pages
- Browser ต้องได้รับสิทธิ์ Camera
- ใช้กล้องหลังเป็นค่าเริ่มต้น
- Android/Chrome ใช้ BarcodeDetector เมื่อรองรับ
- iPhone/Safari และ Browser ที่ไม่รองรับ ใช้ ZXing fallback
