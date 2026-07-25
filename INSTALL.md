# Master 3.5.2 — Reports Payment Breakdown Hotfix

อัปโหลดเขียนทับเฉพาะ:

- `reports.html`
- `js/reports.js`

## แก้ไข

- แยกยอด QR และเงินโอนจากรายการบิลจริง
- รองรับชื่อช่องทางเดิม เช่น TRANSFER, BANK_TRANSFER, เงินโอน และ โอน
- ไม่พึ่งฟิลด์ `transfer_revenue` ที่ RPC ปัจจุบันไม่ได้ส่ง
- ตาราง รายละเอียดบิล และ CSV แสดงชื่อช่องทางภาษาไทย

## ไม่ได้แก้

- POS
- Dashboard
- Database / SQL / RPC
- Receipt / Hardware / Drawer

Commit:
`Deploy Master 3.5.2 Reports Payment Breakdown Hotfix`

รอ Deploy แล้วกด `Ctrl + Shift + R`

ไม่ต้องรัน SQL
