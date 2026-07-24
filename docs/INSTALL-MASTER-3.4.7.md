# Master 3.4.7 — Payment, Receipt and Cashier Name

## ลำดับติดตั้ง
1. สำรอง Repository และ Database
2. อัปโหลดไฟล์ทั้งหมดในแพ็กนี้ไปที่ root ของ Repository โดยรักษาโครงสร้าง `js/`, `css/`, `sql/`
3. Commit: `Deploy Master 3.4.7 payment receipt cashier update`
4. รัน SQL `sql/UPGRADE-MASTER-3.4.7-RECEIPT-CASHIER-NAME.sql` หนึ่งครั้ง
5. รอ Deploy แล้วกด `Ctrl + Shift + R`
6. เข้า `users-admin.html` และตั้งค่า “ชื่อแคชเชียร์บนใบเสร็จ”

## พฤติกรรมใหม่
- วิธีชำระเงินอยู่ใน Popup และค่าเริ่มต้นเป็นเงินสด
- ต้องเลือกวิธีชำระก่อนรับชำระ
- เงินรับ/เงินทอนแสดงเฉพาะเงินสด
- หัวบิลแสดงเฉพาะ “ใบเสร็จรับเงิน” และชื่อบริษัท
- ตัดที่อยู่และเลขผู้เสียภาษีออก
