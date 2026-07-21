# TKN Dashboard Phase 9.2 — Safe Upgrade v2.0

## จุดสำคัญ

ชุดนี้ใช้ชื่อไฟล์ใหม่ทั้งหมด จึงไม่ทับและไม่แก้ไฟล์เดิม:

- `dashboard.html`
- `css/dashboard-v2.css`
- `js/dashboard-v2.js`
- `js/supabase-config.js`
- `js/supabase-client.js`

## ไฟล์ใหม่

```text
dashboard-phase-9-2.html
css/dashboard-phase-9-2.css
js/dashboard-phase-9-2.js
```

## ความสามารถเพิ่ม

- เมนูค้นหาบิลย้อนหลัง
- เมนูคืนสินค้าจากบิล
- เมนูพิมพ์ใบเสร็จย้อนหลัง
- ใช้ Supabase Client แยกเฉพาะหน้า Dashboard ใหม่
- ไม่ชนกับ config แบบ classic/module ของหน้าเดิม
- เก็บ Auth session ด้วย storage key แยก

## ติดตั้ง

1. อัปโหลด 3 ไฟล์/โฟลเดอร์ตามโครงสร้างเดิม
2. ห้ามเปลี่ยนชื่อไฟล์เดิมและไม่ต้องลบไฟล์ใด
3. Commit:

```text
Phase 9.2 - Add isolated upgraded dashboard v2
```

4. เปิดหน้าใหม่:

```text
https://onlinemkttkn.github.io/inventory-barcode-system-tkn/dashboard-phase-9-2.html
```

5. กด `Ctrl + Shift + R`
6. เข้าระบบ แล้วกด `ค้นหาบิลย้อนหลัง`

## เงื่อนไข

ใน Repository ต้องมีไฟล์เดิมของ Phase 9.2 อยู่แล้ว:

```text
phase-9-2-bill-search.html
sales-return.html
phase-9-2-reprint-receipt.html
```

หน้าคืนสินค้าไม่ควรเปิดตรง ๆ ต้องเปิดจาก:

```text
Dashboard Phase 9.2 → ค้นหาบิลย้อนหลัง → ดูรายละเอียด → คืนสินค้า
```

ระบบจะส่ง `sale_id` และ `sale_no` ผ่าน URL ให้อัตโนมัติ
