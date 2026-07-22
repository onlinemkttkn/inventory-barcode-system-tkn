# Phase 9.5 — System Integration Safe Pack v1.0

## จุดประสงค์

เชื่อมโมดูล Phase 09.2 เข้ากับหน้าตาและระบบ Login ของ Dashboard Phase 08.2
โดยไม่ทับ `dashboard.html` เดิม

## ไฟล์ใหม่

```text
dashboard-integrated-phase-9-5.html
css/phase-9-5-integration.css
```

หน้าใหม่นี้ยังใช้ไฟล์เดิมของ Phase 08.2:

```text
css/dashboard-v2.css
js/supabase-config.js
js/dashboard-v2.js
```

จึงมีหน้าตาและพฤติกรรมเหมือน Dashboard 08.2

## เมนูที่เพิ่ม

- ค้นหาบิลย้อนหลัง
- คืนสินค้าจากบิล
- ประวัติคืนสินค้า
- รายงานสินค้าคืน

## ไฟล์ Phase 09.2 ที่ต้องมีอยู่ใน Repository

```text
phase-9-2-bill-search-v2-2.html
sales-return-v2-2.html
sales-return-history-v2-3.html
sales-return-receipt-v2-3.html
sales-return-report-v2-3.html
```

## ติดตั้ง

1. อัปโหลดไฟล์ทั้งหมดใน ZIP โดยรักษาโครงสร้าง
2. ไม่ต้องลบหรือเปลี่ยน `dashboard.html`
3. Commit:

```text
Phase 9.5 - Integrate Phase 9.2 into Dashboard 8.2
```

4. เปิด:

```text
https://onlinemkttkn.github.io/inventory-barcode-system-tkn/dashboard-integrated-phase-9-5.html
```

5. กด `Ctrl + Shift + R`
6. ทดสอบเมนูใหม่ทั้งหมด

## หลัง UAT ผ่าน

สามารถเปลี่ยนชื่อหน้าใหม่นี้เป็น `dashboard.html` ในรอบ Deploy สุดท้าย
แต่ควรสำรอง `dashboard.html` เดิมก่อน เช่น:

```text
dashboard-phase-8-2-backup.html
```
