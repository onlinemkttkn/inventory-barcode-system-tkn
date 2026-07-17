# CHANGELOG — TKN POS / ERP

## v1.0.0 — Phase 9.1

### Added
- ระบบผู้จำหน่าย (Supplier)
- เครดิตเทอมและข้อมูลภาษีผู้จำหน่าย
- สร้างใบสั่งซื้อ Purchase Order
- สถานะ DRAFT / SUBMITTED / APPROVED
- ส่ง PO เพื่ออนุมัติ
- Admin อนุมัติ PO
- ประวัติและยอดรวม PO
- `sql/phase09_1.sql`

### Improved
- รวมเป็น Full Build อัปโหลดทับ GitHub ได้ทั้งชุด
- ตรวจและแก้ Path ของ CSS/JavaScript ให้เป็น `./css/...` และ `./js/...`
- เพิ่ม Cache Version `v=1.0.0`
- ใช้ Supabase Config กลาง
- ปรับ Session ให้คงอยู่หลังรีเฟรช
- รวม Navigation กลางและปุ่มย้อนกลับ
- รวม `pos.js` เวอร์ชันแก้ราคาขายและยอดรวม
- รวมระบบใบเสร็จ คืนสินค้า สมาชิก สินค้า และ Import/Export

### Removed
- ไม่ใช้ไฟล์ตัวอย่าง `supabase-config.example.js` ในการทำงานจริง
- ไม่จำเป็นต้องอัปโหลดโฟลเดอร์ครอบด้านนอกขึ้น GitHub
