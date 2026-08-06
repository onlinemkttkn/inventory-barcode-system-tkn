# Database Safety Audit — v5.26.1

## ผลตรวจรุ่นเดิม v5.26.0

ไม่อนุมัติให้อัปโหลด/รัน เพราะพบ:

- UPDATE ข้อมูลกล่องเดิมระหว่างติดตั้ง
- กำหนดสาขาให้กล่องเก่าโดยสมมติค่า
- ALTER ตารางหลักและ Constraint
- Trigger บน `stock_boxes`, `stock_box_items`, `sales`, `sale_items`, `transfer_documents`
- Logic ขายที่เขียนลงตาราง POS โดยไม่ใช้ RPC POS เดิมครบกระบวนการ

## ผลตรวจรุ่นแก้ไข v5.26.1 DB-SAFE

ผ่านการตรวจแบบ Static ตามเงื่อนไขต่อไปนี้:

- ไม่มี `DROP`, `TRUNCATE`, `UPDATE` หรือ `DELETE` ระดับติดตั้งบนตารางหลัก
- ไม่มี `ALTER TABLE` หรือ Trigger บนตารางหลัก
- Installer เพิ่มเฉพาะ Permission และ Object Prefix `tkn_v5261_*`
- ไม่เขียน `system_migrations` หรือเปลี่ยน Migration เดิม
- Read-only Preflight/Verify ไม่มีคำสั่งเขียนข้อมูล
- JavaScript Syntax ผ่านทุกไฟล์
- HTML อ้างอิงไฟล์ครบเมื่อรวมกับโปรเจกต์เดิม
- Service Worker อ้างอิง Asset ครบ

## การเปลี่ยนข้อมูลที่เกิดเฉพาะตอนผู้ใช้ยืนยัน

- เบิกหน้าร้าน: ลบตำแหน่งสินค้าใน `stock_box_items` ของกล่องที่เลือก และเปิดกล่องเป็น DRAFT โดยไม่ลดสต็อกสาขา
- โอนไปสาขา: เรียก `create_branch_transfer` เดิม
- รับกล่อง: เรียก `receive_branch_transfer` เดิม
- ขายยกกล่อง: เรียก `create_pos_sale` เดิมก่อน แล้วจึงปิดรอบและทำกล่องว่างใน Transaction เดียว

## ข้อจำกัดการรับรอง

การตรวจนี้เป็น Static Audit จากโครงสร้างโปรเจกต์ที่ได้รับ ยังไม่ได้รันกับ Supabase Production จริง จึงต้องรัน Preflight และทดสอบ UAT ในสาขาทดลองก่อนเปิดใช้งานจริง
