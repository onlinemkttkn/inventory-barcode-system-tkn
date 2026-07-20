# TKN POS / ERP — Phase 9.2 Combined After-Sales Pack

ชุดนี้รวม:
- Search Bill เวอร์ชันล่าสุด
- ดูรายละเอียดบิลผ่าน RPC
- Reprint Receipt 58mm / 80mm
- Void Bill Foundation
- HTML / CSS / JS / SQL / Docs / Manifest

## ขั้นตอนติดตั้ง

### 1. แตก ZIP
แตกไฟล์ทั้งหมด จะได้โครงสร้างประมาณ:

```text
phase-9-2-reprint-receipt.html
phase-9-2-void-bill.html
css/
js/
sql/
docs/
*.json
```

### 2. อัปโหลดเข้า GitHub
ลากทุกไฟล์และทุกโฟลเดอร์เข้า Repository โดยรักษาโครงสร้างเดิม

ไฟล์สำคัญที่ต้องทับของเดิม:

```text
js/phase-9-2-bill-search.js
```

Commit แนะนำ:

```text
Phase 9.2 - Install complete after-sales pack
```

### 3. รัน SQL ใน Supabase ตามลำดับ

รันเฉพาะไฟล์ที่ยังไม่เคยรัน:

```text
sql/phase-9-2-reprint-receipt.sql
sql/phase-9-2-void-bill.sql
```

หาก `get_sale_items_phase_9_2` ยังไม่มี ให้รัน:

```text
sql/phase-9-2-bill-detail-rpc.sql
```

แต่ถ้าเคยรันและตรวจแล้วว่ามี Function อยู่ ไม่ต้องรันซ้ำก็ได้

### 4. ตรวจ HTML ของ Search Bill

ไฟล์ `phase-9-2-bill-search.html` ต้องมีปุ่มนี้ใน dialog:

```html
<button
  class="danger-button"
  data-permission="pos.void_bill"
  id="voidButton"
  type="button">
  ยกเลิกบิล
</button>
```

ให้อยู่ใกล้กับปุ่ม:

- พิมพ์ใบเสร็จซ้ำ
- คืนสินค้า

หากยังไม่มี ให้เพิ่มก่อนปิด `</div>` ของ `.dialog-actions`

### 5. รอ GitHub Pages Deploy
รอประมาณ 1–3 นาที แล้วกด:

```text
Ctrl + Shift + R
```

### 6. ทดสอบ

#### Search Bill
- เปิดหน้า `phase-9-2-bill-search.html`
- ตรวจว่าดึงข้อมูลจริงได้

#### Bill Detail
- กด “ดูรายละเอียด”
- ต้องเห็นสินค้าและยอดรวม

#### Reprint
- กด “พิมพ์ใบเสร็จซ้ำ”
- ต้องเปิดหน้าใหม่
- เลือก 58mm / 80mm ได้

#### Void Bill
- กด “ยกเลิกบิล”
- URL ต้องมี `sale_id`
- กรอกเหตุผลอย่างน้อย 5 ตัวอักษร
- ทดสอบกับบิลทดลองเท่านั้น

## ข้อควรระวัง

Void Bill รุ่นนี้ยังไม่คืนสต็อกอัตโนมัติ
ต้องตรวจระบบ `stock_movements` และ `branch_inventory` ก่อนเชื่อมคืนสต็อกจริง
