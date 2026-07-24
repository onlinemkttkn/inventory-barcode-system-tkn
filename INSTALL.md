# Master 3.4.14 — VAT, Cashier Name, POS Header Hotfix

แก้เฉพาะ:
- คืนรายละเอียด VAT 7% บนใบเสร็จ
- ชื่อพนักงานบนบิลตรงกับรหัสพนักงานที่ใช้เปิดกะ
- จัดช่องสาขา ชื่อลูกค้า และเบอร์โทรบนหน้า POS

ไม่ได้แก้:
- การเปิดลิ้นชัก
- Hardware Service / Bridge
- ขั้นตอนสั่งพิมพ์และกลับหน้า POS
- Payment / Shift RPC
- Supabase / Database / SQL

## อัปโหลด

- `pos.html`
- `pos.css`
- `receipt.html`
- `js/receipt.js`

Commit:
`Deploy 3.4.14 VAT cashier POS header hotfix`

รอ Deploy แล้วกด `Ctrl + Shift + R`

ไม่ต้องรัน SQL
