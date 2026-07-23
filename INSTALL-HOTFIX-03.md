# Master 3.4.3 Hotfix-03 — Branch Guard

อัปโหลด `pos.html`, `pos.js`, `pos.css` ไปที่ root ของ Repository และเขียนทับไฟล์เดิม

ไม่ต้องรัน SQL

หลัง Deploy ให้กด `Ctrl + Shift + R`

ทดสอบว่า:
- สาขาถูกเลือกอัตโนมัติ
- ไม่มี `invalid input syntax for type uuid: ""`
- Network ไม่มี `branch_inventory_list` Status 400
