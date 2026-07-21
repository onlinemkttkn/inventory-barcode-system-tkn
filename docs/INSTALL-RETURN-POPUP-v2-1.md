# Phase 9.2 Return Popup Safe Upgrade v2.1

## แก้ปัญหา

```text
invalid input value for enum sale_status: "PARTIAL_RETURN"
```

และเพิ่มขั้นตอนสำเร็จแบบ Popup:

1. กด `ยืนยันคืนสินค้า`
2. ระบบบันทึกคืนสินค้าและคืนสต็อก
3. แสดง Popup “คืนสินค้าสำเร็จ”
4. นับถอยหลัง 3 วินาที
5. หน้าต่างคืนสินค้าปิดอัตโนมัติ
6. หน้าค้นหาบิลด้านหลังรีเฟรชอัตโนมัติ

## ไม่กระทบไฟล์เก่า

ไฟล์ในชุดนี้ใช้ชื่อใหม่ทั้งหมด:

```text
dashboard-phase-9-2-v2-1.html
phase-9-2-bill-search-v2-1.html
sales-return-v2-1.html
js/phase-9-2-bill-search-v2-1.js
js/phase-9-2-sales-return-v2-1.js
css/phase-9-2-return-popup-v2-1.css
```

## ขั้นตอนติดตั้ง

### 1. รัน SQL ก่อน

Supabase → SQL Editor:

```text
sql/phase-9-2-sale-status-enum-upgrade-v2-1.sql
```

ผลลัพธ์ต้องมี:

```text
PARTIAL_RETURN
RETURNED
```

### 2. อัปโหลดไฟล์ทั้งหมดเข้า GitHub

รักษาโครงสร้างโฟลเดอร์เดิม และอย่าลบไฟล์เก่า

Commit:

```text
Phase 9.2 - Add return popup safe upgrade v2.1
```

### 3. เปิด Dashboard ใหม่

```text
dashboard-phase-9-2-v2-1.html
```

หรือเปิดหน้าค้นหาบิลใหม่โดยตรง:

```text
phase-9-2-bill-search-v2-1.html
```

### 4. ทดสอบ

```text
ค้นหาบิล
→ ดูรายละเอียด
→ คืนสินค้า
→ ระบุจำนวนและเหตุผล
→ ยืนยันคืนสินค้า
```

เมื่อสำเร็จ Popup จะปิดเองใน 3 วินาที
