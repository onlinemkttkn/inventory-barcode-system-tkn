# Phase 7.2 ระบบโอนสินค้าระหว่างสาขา

สำหรับร้านเถ้าแก่น้อยชลบุรีและสาขา

## ติดตั้ง
1. รัน `sql/phase07_2.sql` ใน Supabase SQL Editor
2. ตรวจสอบ `js/supabase-config.js`
3. เปิด `index.html` ด้วย Live Server
4. ทดสอบ:
   - transfer-create.html
   - transfer-receive.html
   - branch-stock.html
   - transfer-history.html
5. อัปโหลดไฟล์ทั้งหมดทับ Repository เดิมบน GitHub Pages

## ขั้นตอนทำงาน
สำนักงานใหญ่สร้างใบโอน → ระบบตัดยอดต้นทาง → สถานะ IN_TRANSIT →
สาขาปลายทางยืนยันรับ → ระบบเพิ่มยอดปลายทาง → สถานะ RECEIVED
