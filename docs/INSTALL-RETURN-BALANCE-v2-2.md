# Phase 9.2 Return Balance Safe Upgrade v2.2

## สิ่งที่เพิ่ม

หน้า Return แสดงต่อรายการทันที:

- ซื้อทั้งหมด
- คืนไปแล้ว
- ยังคืนได้ก่อนรายการนี้
- คืนครั้งนี้
- เหลือคืนได้หลังรายการนี้
- ยอดเงินคืนครั้งนี้

เมื่อคืนครบแล้ว ช่องจำนวนจะถูกปิดและขึ้นป้าย `คืนครบแล้ว`

เมื่อบันทึกสำเร็จ:

1. แสดง Popup สำเร็จ
2. นับถอยหลัง 3 วินาที
3. ปิดหน้าต่างคืนสินค้าอัตโนมัติ
4. รีเฟรชหน้าค้นหาบิลด้านหลัง

## ไม่กระทบไฟล์เดิม

ชุดนี้ใช้ชื่อใหม่ทั้งหมด:

```text
dashboard-phase-9-2-v2-2.html
phase-9-2-bill-search-v2-2.html
sales-return-v2-2.html
js/phase-9-2-bill-search-v2-2.js
js/phase-9-2-sales-return-v2-2.js
```

## ติดตั้ง

1. รัน SQL:

```text
sql/phase-9-2-return-upgrade-v2-2.sql
```

2. อัปโหลดไฟล์ทั้งหมดเข้า GitHub โดยรักษาโครงสร้าง
3. ไม่ต้องลบหรือทับไฟล์เดิม
4. Commit:

```text
Phase 9.2 - Add return balance safe upgrade v2.2
```

5. เปิด:

```text
https://onlinemkttkn.github.io/inventory-barcode-system-tkn/dashboard-phase-9-2-v2-2.html
```

หรือ:

```text
https://onlinemkttkn.github.io/inventory-barcode-system-tkn/phase-9-2-bill-search-v2-2.html
```

6. กด `Ctrl + Shift + R`
