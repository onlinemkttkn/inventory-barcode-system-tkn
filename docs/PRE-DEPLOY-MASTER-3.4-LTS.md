# PRE-DEPLOY CHECK — Master 3.4 LTS RC

ก่อนอัปโหลด ห้ามข้ามรายการนี้

## สำรอง
- [ ] ดาวน์โหลด Repository ปัจจุบันเป็น ZIP
- [ ] เก็บ Commit hash ของ Master 3.3 LTS
- [ ] สำรองฐานข้อมูล Supabase

## ตรวจระบบเดิม
- [ ] Master 3.3 LTS Login ได้
- [ ] Owner/Admin เข้า Dashboard ได้
- [ ] Staff เข้า POS ได้
- [ ] VOID_SALE มี Log
- [ ] STOCK_ADJUST มี Log
- [ ] create_branch_transfer(uuid,uuid,jsonb,text,text) มีอยู่
- [ ] issue_inventory(jsonb,text,text,text,text) มีอยู่
- [ ] Permission product.manage, inventory.issue, inventory.transfer, report.view มีอยู่

## ตรวจอุปกรณ์
- [ ] ทดสอบมือถือ Android ผ่าน HTTPS
- [ ] ทดสอบสิทธิ์กล้อง
- [ ] iPhone/Safari อาจไม่รองรับ BarcodeDetector และจะใช้การกรอก/เครื่องสแกนแทน
