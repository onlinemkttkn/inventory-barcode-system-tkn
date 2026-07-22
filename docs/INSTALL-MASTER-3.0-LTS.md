# TKN POS / ERP — Master 3.0 LTS

แพ็กนี้สร้างจาก Repository ล่าสุดที่ผู้ใช้ดาวน์โหลดจาก GitHub
และเป็น Production Baseline เพียงชุดเดียว

## โครงสร้างหลัก

- `dashboard.html` — Dashboard ผู้บริหาร
- `pos.html` — ขายหน้าร้าน
- `products-admin.html` — จัดการสินค้า
- `product-stock-admin.html` — ปรับสต็อก
- `phase-9-2-bill-search.html` — ค้นหาและตรวจสอบบิล
- `phase-9-2-void-bill.html` — ยกเลิกบิล
- `sales-return.html` — คืนสินค้า
- `sales-return-history.html` — ประวัติคืน
- `sales-return-report.html` — รายงานคืน

ชื่อไฟล์เก่าที่จำเป็นถูกเปลี่ยนเป็น Redirect ขนาดเล็ก
จึงไม่โหลดโค้ดเก่าอีก แต่ Bookmark เดิมยังเปิดหน้าใหม่ได้

## สิทธิ์

- Owner / Admin / Secretary: Dashboard
- Cashier / Staff / Sales: POS
- Warehouse: หน้าสต็อก
- Accounting: ตรวจสอบบิล
- ยกเลิกบิล: Owner / Admin / Manager / Supervisor
- ปรับสต็อก: Owner / Admin / Warehouse
- จัดการสินค้า: Owner / Admin

## ติดตั้งแบบ Clean Deploy

1. ดาวน์โหลด ZIP สำรอง Repository เดิม
2. ลบไฟล์และโฟลเดอร์เดิมใน Repository ยกเว้น `.git`
3. อัปโหลดเนื้อหาทั้งหมดจากแพ็กนี้เข้า root
4. Commit:

```text
Deploy TKN POS ERP Master 3.0 LTS
```

5. เข้า Supabase SQL Editor และรัน:

```text
sql/MASTER-3.0-LTS.sql
```

6. เปิด `dashboard.html` และกด `Ctrl + Shift + R`

## สำคัญ

อย่าอัปโหลดแพ็กเก่าทับ Master 3.0 LTS หลังติดตั้ง
การพัฒนาเฟสถัดไปต้องเริ่มจาก ZIP ชุดนี้เท่านั้น
