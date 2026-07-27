# TKN Navigation New Tab Bugfix v4.9.0

แก้ปัญหาเมื่อ Owner หรือ Admin คลิกขวาเมนูแล้วเลือก **Open link in new tab** หน้าใหม่แสดงชื่อสิทธิ์เป็น `staff` และเมนูด้านข้างหาย เหลือเฉพาะหน้าที่เปิดอยู่

## สาเหตุ

`sessionStorage` แยกกันระหว่างแท็บ ทำให้แท็บใหม่ไม่มี `tkn_permissions` และ `tkn_user_role` เดิม ขณะที่ไฟล์ `navigation.js` รุ่นก่อนสร้างเมนูทันทีจากค่าที่ว่าง จึงแสดงค่าเริ่มต้นเป็น `staff`

## สิ่งที่แก้

- เมนูตรวจ Supabase session ของแท็บใหม่โดยตรง
- โหลดสิทธิ์จริงจาก RPC `current_access_context`
- ตรวจว่า `user_id` ตรงกับ session และบัญชียังเปิดใช้งาน
- บันทึก access context กลับเข้า `sessionStorage` ของแท็บใหม่
- ไม่สร้างเมนูปลอมเป็น `staff` เมื่อยังตรวจสิทธิ์ไม่ได้
- เพิ่ม retry สำหรับการอ่าน session และ RPC
- ปรับ query version ของ `navigation.js` เป็น `v=4.9.0` เพื่อป้องกัน browser cache

## ไม่ได้เปลี่ยน

- ไม่มีการแก้ SQL, Table, RLS, RPC หรือโครงสร้างฐานข้อมูล
- ไม่มีการเปลี่ยน Role หรือ Permission ของผู้ใช้
- ไม่มีการเปลี่ยนข้อมูลสินค้า สต๊อก POS และรายงาน
