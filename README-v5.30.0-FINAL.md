# TKN v5.30.0 FINAL — Warehouse One-Flow

Flow หลักหลังแพตช์:

`คัดแยก → ปิดกล่อง → WAITING_STOCK → ตรวจรับเข้าสต็อก → IN_STOCK + WAITING_PUTAWAY → สแกนขึ้นชั้น → PUTAWAY → เบิกสินค้า → หน้าร้าน`

## หลักการ
- ปิดกล่อง **ไม่เพิ่มสต็อก** แต่สร้างคิว Stock Intake ทันที
- Stock Intake เพิ่ม Inventory เพียงครั้งเดียวและสร้างคิวขึ้นชั้นอัตโนมัติ
- ขึ้นชั้นจัดเก็บเป็นการ Recheck QR + Shelf เท่านั้น **ไม่เพิ่ม/ลด Inventory ซ้ำ**
- Backend บังคับสาขาเป้าหมายเป็น `โกดังเก็บสินค้า` สำหรับ Close/Intake/Putaway
- หน้า inventory/import ที่เกี่ยวข้องจะเลือก `โกดังเก็บสินค้า` อัตโนมัติ
- Transfer ยังคงให้เลือกปลายทางได้ แต่ Source ถูกตั้งเป็นโกดัง
- POS ไม่ถูกบังคับเป็นโกดัง เพราะเป็นปลายทางขายหน้าร้าน

## ก่อนติดตั้ง
1. รัน `sql/00-PREFLIGHT-v5.30.0-READ-ONLY.sql` — ทุกข้อ PASS
2. รัน `sql/01-INSTALL-v5.30.0-WAREHOUSE-FLOW.sql`
3. รัน `sql/02-VERIFY-v5.30.0-READ-ONLY.sql` — ทุกข้อ PASS
4. อัปไฟล์เว็บในแพตช์ทับ repo
5. รอ GitHub Pages แล้วปิดแท็บเก่าทั้งหมด/เปิดใหม่

## UAT บังคับ
- ปิดกล่อง 1 กล่อง → ต้องโผล่ Stock Intake ทันที
- รับเข้า → Inventory เพิ่มครั้งเดียว + กล่องหายจาก Intake และไป Putaway
- สแกนขึ้นชั้น → จำนวน Inventory ต้องไม่เปลี่ยน
- สแกน/รับซ้ำ → ต้องไม่เพิ่ม Stock ซ้ำ
- เบิกจากโกดัง → Flow เดิมทำงานต่อ

## Protected
แพตช์นี้ไม่แก้ `stock-promotions.html`, `js/stock-promotions-v5-25-0.js`, `print-labels.html`
