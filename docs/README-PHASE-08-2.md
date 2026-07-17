# Phase 8.2 — Dashboard Version 2

แก้ปัญหา Dashboard เดิมที่ยังอ่าน `products.quantity` และ `product_list`
โดยเปลี่ยนมาใช้ข้อมูลจริงจาก `branch_inventory` และยอดขายจาก POS

## ความสามารถ
- สินค้าทั้งหมด
- สินค้าหมด/ใกล้หมดทุกสาขา
- ยอดขายวันนี้
- จำนวนบิลวันนี้
- ยอดขายเดือนนี้
- ใบโอนรอรับ
- มูลค่าทุนและมูลค่าขายสินค้าคงเหลือ
- สต๊อกอัปเดตล่าสุดแยกสาขา
- ยอดขายล่าสุด
- Top 10 สินค้าขายดีเดือนนี้
- กราฟยอดขาย 14 วัน
- กรองสาขา
- รองรับมือถือและ GitHub Pages

## วิธีติดตั้ง
1. รัน `sql/phase08_2.sql`
2. ตรวจสอบ `js/supabase-config.js`
3. เปิด `index.html` ผ่าน Live Server
4. ตรวจหน้า `dashboard.html`
5. อัปโหลดไฟล์ทั้งหมดทับ Repository เดิม

## สำคัญ
ไฟล์ Dashboard ใหม่ใช้:
- `css/dashboard-v2.css`
- `js/dashboard-v2.js`

จึงไม่ใช้ `js/dashboard.js` เดิมแล้ว
