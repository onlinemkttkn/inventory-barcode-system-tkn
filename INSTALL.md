# Master 3.4.16 — POS Logout Guard + Responsive Final

## อัปโหลดเฉพาะ 3 ไฟล์

- `pos.html`
- `pos.css`
- `pos.js`

## สิ่งที่เพิ่ม

- กดปุ่มออกจากระบบสีแดงระหว่างมีกะเปิดอยู่ ระบบจะไม่ Logout
- แสดงข้อความ:
  - ไม่สามารถออกจากระบบได้
  - ยังมีการเปิดกะอยู่
  - กรุณาปิดกะก่อนออกจากระบบ
- มีปุ่มเดียว: `กลับไป POS`
- ปรับ Popup ทุกตัวให้พอดีกับ Desktop, Tablet และ Mobile
- ไม่มี Scroll แนวนอนใน Popup

## ไม่ได้แก้

- Database / SQL / RPC
- Navigation
- Receipt / VAT / Printing
- Hardware Service / PowerShell Bridge
- Payment / Drawer Logic
- เปิดกะ / ปิดกะเดิม

## วิธีอัป

1. สำรอง Commit ปัจจุบัน
2. อัปโหลด 3 ไฟล์นี้ไปที่ root ของ Repository
3. เขียนทับไฟล์เดิม
4. Commit:

`Deploy Master 3.4.16 POS Logout Guard Responsive Final`

5. รอ Deploy
6. กด `Ctrl + Shift + R`

ไม่ต้องรัน SQL
