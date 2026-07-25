# Master 3.5.4 — Access Control Stable

## ลำดับติดตั้ง
1. สำรองฐานข้อมูล/Commit ปัจจุบัน
2. รัน `sql/UPGRADE-3.5.4-ACCESS-CONTROL.sql` ใน Supabase SQL Editor หนึ่งครั้ง
3. อัปโหลดเขียนทับ:
   - `users-admin.html`
   - `js/users-admin.js`
   - `css/governance.css`
4. Commit: `Deploy Master 3.5.4 Access Control Stable`
5. รอ Deploy และกด Ctrl+Shift+R

SQL เป็นแบบ Additive: ไม่ลบ Table, Column, User, Role หรือข้อมูลธุรกรรม
