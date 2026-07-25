# Master 3.5.9 — Cash Refund Drawer Hotfix

## อัปโหลดเฉพาะ

- `sales-return.html`
- `js/sales-return.js`
- `css/sales-return.css`

## การทำงาน

- คืนเงินแบบ CASH:
  - บันทึกคืนสินค้าสำเร็จก่อน
  - เปิดลิ้นชักหนึ่งครั้ง
  - Hardware ล้มไม่ Rollback การคืนสินค้า
  - บันทึกผลเปิดลิ้นชักแบบ Best Effort

- ยอดคืนเงินสดตั้งแต่ 5,000 บาท:
  - ขอ Employee Code + PIN
  - ตรวจผ่าน RPC เดิม `authorize_cash_drawer_reopen_v3_4`
  - จึงบันทึกคืนสินค้าและเปิดลิ้นชัก

- TRANSFER / STORE_CREDIT / ORIGINAL:
  - ไม่เปิดลิ้นชัก

## ไม่ได้แก้

- POS
- Dashboard
- Reports
- Hardware Service / PowerShell Bridge
- SQL / Database / RPC
- Receipt
- หน้าอื่นทั้งหมด

## Commit

`Deploy Master 3.5.9 Cash Refund Drawer Hotfix`

หลัง Deploy กด `Ctrl + Shift + R`
