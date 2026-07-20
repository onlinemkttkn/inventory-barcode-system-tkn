# TKN POS / ERP Phase 9.2 — Complete Bill Module

## ภายในชุด

- Search Bill พร้อม CSS
- Supabase Client
- Permission UI
- Bill Detail RPC
- Reprint Receipt 58mm/80mm
- Void Bill Foundation
- SQL ครบทุกฟังก์ชัน

## ขั้นตอนติดตั้ง

### 1. แตก ZIP

จะได้โครงสร้าง:

```text
phase-9-2-bill-search.html
phase-9-2-reprint-receipt.html
phase-9-2-void-bill.html
css/
js/
sql/
docs/
```

### 2. อัปโหลดทั้งหมดเข้า GitHub

ลากทุกไฟล์และโฟลเดอร์เข้า Repository โดยรักษา path เดิม

Commit:

```text
Phase 9.2 - Install complete bill module
```

### 3. รัน SQL ใน Supabase ตามลำดับ

```text
sql/01-search-sales-bills.sql
sql/02-get-sale-items.sql
sql/03-get-sale-receipt.sql
sql/04-void-sale.sql
```

SQL ใช้ `create or replace function` จึงรันซ้ำได้

### 4. รอ GitHub Pages

รอ 1–3 นาที แล้วกด:

```text
Ctrl + Shift + R
```

### 5. ทดสอบ

1. เปิด `phase-9-2-bill-search.html`
2. ตรวจว่าหน้ามี CSS และโหลดบิลจริง
3. กดดูรายละเอียด
4. กดพิมพ์ใบเสร็จซ้ำ
5. กดยกเลิกบิลจากหน้ารายละเอียด
6. ใช้บิลทดลองเท่านั้น

## ข้อควรระวัง

- Void Bill รุ่นนี้ยังไม่คืนสต็อก
- อย่าใส่ Service Role Key ในไฟล์หน้าเว็บ
- หากระบบยังไม่มี Login อาจต้อง Grant RPC ให้ `anon` ชั่วคราว แต่ไม่แนะนำสำหรับ Production
