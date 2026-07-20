# Phase 9.2 — Module 2.1
## เชื่อม Search Bill กับ Supabase จริง

ชุดนี้ใช้ตารางจริงที่ตรวจสอบแล้ว:

- `public.sales`
- `public.sale_items`

## ไฟล์ในชุด

```text
js/phase-9-2-bill-search.js
sql/phase-9-2-search-bill-real.sql
docs/PHASE-09-2-MODULE-02-1-REAL-SUPABASE.md
PHASE-09-2-MODULE-02-1-MANIFEST.json
```

## ลำดับติดตั้ง

### 1. สำรองไฟล์ JavaScript เดิม

สำรอง:

```text
js/phase-9-2-bill-search.js
```

### 2. แทนที่ไฟล์ JavaScript

นำไฟล์ใหม่ไปแทน:

```text
js/phase-9-2-bill-search.js
```

### 3. ตรวจ Supabase Client

ไฟล์ JavaScript จะค้นหา Client จาก:

```javascript
window.supabaseClient
```

หรือ:

```javascript
window.supabase
```

หากโปรเจกต์สร้าง Client ในไฟล์อื่น ให้แก้ `getSupabaseClient()` เพื่อ import Client เดิม

ห้ามใส่ Service Role Key ใน Browser

### 4. รัน SQL

เปิด Supabase SQL Editor แล้วรัน:

```text
sql/phase-9-2-search-bill-real.sql
```

ไฟล์จะสร้าง Function:

```text
search_sales_bills_phase_9_2
```

และทดสอบ Query ให้ทันที

### 5. เปิดหน้า Search Bill

```text
phase-9-2-bill-search.html
```

ผลลัพธ์ควรดึงจาก `sales` จริง

## การค้นหาที่รองรับ

- `sales.sale_no`
- `sales.customer_name`
- `sales.customer_phone`
- `sale_items.product_code_snapshot`
- `sale_items.barcode_snapshot`
- `sale_items.product_name_snapshot`
- วันที่จาก `sales.created_at`
- วิธีชำระจาก `sales.payment_method`
- สถานะจาก `sales.status`

## หมายเหตุ Sales Channel

จากภาพตาราง `sales` ยังไม่ยืนยันว่ามีคอลัมน์ `sales_channel`

SQL จึงใช้:

```sql
to_jsonb(s)->>'sales_channel'
```

ถ้ามีคอลัมน์ จะใช้ค่าจริง  
ถ้าไม่มี จะใช้ `STORE`

ระบบไม่แก้ตาราง `sales` ใน Module นี้

## การทดสอบ

1. เปิดหน้าแล้วต้องเห็นรายการจริง
2. ค้นด้วยเลขบิล เช่น `SL2026`
3. ค้นด้วยรหัสสินค้า เช่น `PD000001`
4. ค้นด้วย Barcode
5. กรอง `CASH`
6. กดดูรายละเอียด ต้องเห็นรายการจาก `sale_items`
7. เปิด Console ต้องไม่มี Error

## ปัญหาที่อาจพบ

### `ไม่พบ Supabase client`

โปรเจกต์ยังไม่ได้ expose client เป็น `window.supabaseClient`

ให้เชื่อม client เดิมเข้ากับหน้า หรือแก้ import ใน JavaScript

### RPC permission denied

ตรวจว่า User Login แล้ว และ SQL ได้ Grant ให้ `authenticated`

### Enum mismatch

Dropdown ส่งค่าไม่ตรงกับ Enum จริง เช่น `cash` แต่ฐานข้อมูลเป็น `CASH`

JavaScript และ RPC เวอร์ชันนี้เปรียบเทียบแบบไม่สนตัวพิมพ์ แต่ค่า Select ควรปรับให้ตรงในระยะถัดไป
