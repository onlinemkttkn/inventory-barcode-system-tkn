# TKN POS / ERP — Phase 9.2 Completion Safe Upgrade v2.3

## โมดูลในชุด
- ค้นหาบิลย้อนหลัง
- พิมพ์ใบเสร็จซ้ำ
- Void Bill และคืนสต็อก
- คืนสินค้าบางส่วนและเต็มจำนวน
- แสดงยอดซื้อ คืนแล้ว และคงเหลือคืนได้
- Popup ปิดอัตโนมัติ
- ประวัติคืนสินค้า
- พิมพ์ใบคืนสินค้า
- รายงานสินค้าคืน

## ติดตั้ง SQL ตามลำดับ
1. `sql/01-search-sales-returns-v2-3.sql`
2. `sql/02-get-sales-return-receipt-v2-3.sql`
3. `sql/03-get-sales-return-report-v2-3.sql`

## อัปโหลด GitHub
อัปโหลดทุกไฟล์โดยรักษาโครงสร้าง และไม่ลบไฟล์เวอร์ชันเดิม

Commit:
`Phase 9.2 - Install completion safe upgrade v2.3`

## เปิดทดสอบ
`dashboard-phase-9-2-v2-3.html`

## สถานะ
ชุดนี้เป็น UAT Candidate ต้องตรวจตาม `docs/UAT-PHASE-9-2-v2-3.md`
ก่อน Merge เมนูเข้า Dashboard Phase 08.2
