# Master 3.4.13 — POS History + Receipt Return Hotfix

## เปลี่ยนเฉพาะ

- ย้ายปุ่ม `ประวัติการขาย` ไปที่ส่วนปุ่มด้านบนของหน้า POS
- ตัดปุ่ม `ประวัติการขาย` ออกจากหน้าใบเสร็จ
- หลังปิดหน้าต่างพิมพ์ ระบบกลับ `pos.html` อัตโนมัติ
- ปรับลำดับความเด่นของปุ่มสำคัญใน POS และหน้าใบเสร็จ

## ไม่ได้เปลี่ยน

- คำสั่งเปิดลิ้นชัก
- Hardware Client / Hardware Service
- ขั้นตอนบันทึกบิล
- วิธีเรียก Browser Print
- Payment / Shift
- Supabase / Database / SQL

## วิธีอัป

อัปไฟล์ต่อไปนี้ไปที่ root ของ Repository:

- `pos.html`
- `pos.css`
- `receipt.html`
- `js/receipt.js`
- `css/receipt-return.css`

Commit:

`Deploy 3.4.13 POS history receipt return hotfix`

รอ Deploy แล้วกด `Ctrl + Shift + R`

ไม่ต้องรัน SQL
