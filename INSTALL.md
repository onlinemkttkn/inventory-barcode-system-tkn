# Master 3.4.8 Update Only

## อัป Repository
1. สำรอง Commit ปัจจุบัน
2. แตก ZIP และอัปโหลดไฟล์/โฟลเดอร์ทั้งหมดไปที่ root
3. เขียนทับไฟล์ชื่อเดิม และรักษาโครงสร้าง `js/`, `css/`, `sql/`
4. Commit: `Deploy Master 3.4.8 POS VAT Rongta update`
5. รอ Deploy แล้วกด Ctrl+Shift+R

## SQL
รัน `sql/UPGRADE-MASTER-3.4.7-RECEIPT-CASHIER-NAME.sql` เฉพาะเมื่อยังไม่เคยรัน

## Rongta
ติดตั้งและเปิด `printer-bridge/START-RONGTA-BRIDGE.bat` บน Windows 11
ตั้ง Rongta เป็น Default Printer เพื่อให้ Browser Print เลือกเครื่องนี้ง่ายที่สุด
