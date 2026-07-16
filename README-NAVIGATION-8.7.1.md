# Navigation Patch 8.7.1

เพิ่มระบบนำทางกลางให้ทุกหน้าในระบบ

## ความสามารถ
- ปุ่มย้อนกลับทุกหน้า
- ปุ่ม Dashboard ทุกหน้า
- ไม่ย้อนกลับไปหน้า Login
- ถ้าไม่มีประวัติหน้าเดิม จะกลับ Dashboard
- รองรับมือถือ
- ซ่อนปุ่มอัตโนมัติเวลาพิมพ์ใบเสร็จ
- ใช้ได้กับ GitHub Pages
- รวม pos.js เวอร์ชันแก้ราคาขายแล้ว

## ไฟล์ใหม่
- css/navigation.css
- js/navigation.js

## หน้าที่ปรับแล้ว
- scanner.html
- generator.html
- print-labels.html
- receive.html
- issue.html
- transactions.html
- transfer-create.html
- transfer-receive.html
- branch-stock.html
- transfer-history.html
- stock-count.html
- stock-count-history.html
- audit-log.html
- stock-alerts.html
- pos.html
- sales-history.html
- members.html
- member-history.html
- pos-member.html
- products-admin.html
- categories-admin.html
- product-stock-admin.html
- import-export.html
- receipt.html
- sales-return.html
- sales-return-history.html
- sales-return-receipt.html

## วิธีติดตั้ง
1. แตก ZIP
2. อัปโหลดไฟล์ทั้งหมดทับ Repository เดิม
3. รอ GitHub Pages Deploy
4. กด Ctrl + Shift + R
5. ทดสอบเปิดหน้าต่าง ๆ แล้วกด “ย้อนกลับ”
