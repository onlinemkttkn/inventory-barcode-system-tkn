# Phase 9.2 — Module 2.3 Bill Detail RPC Fix

## สาเหตุ

หน้า Search Bill อ่านรายการหัวบิลผ่าน RPC ได้ แต่ปุ่มดูรายละเอียดอ่าน
`public.sale_items` โดยตรง จึงพบ:

```text
permission denied for table sale_items
```

## วิธีแก้

สร้าง RPC แบบ `security definer`:

```text
public.get_sale_items_phase_9_2(uuid)
```

แล้วแก้ JavaScript ให้เรียก RPC แทน `.from('sale_items')`

## ติดตั้ง

1. รัน SQL:

```text
sql/phase-9-2-bill-detail-rpc.sql
```

2. แทนไฟล์:

```text
js/phase-9-2-bill-search.js
```

3. Commit:

```text
Phase 9.2 - Fix bill detail permission with RPC
```

4. รอ GitHub Pages deploy แล้วกดดูรายละเอียดอีกครั้ง

## หมายเหตุ

ไม่ควรแก้ด้วยการเปิด `GRANT SELECT ON sale_items TO anon`
เพราะจะเปิดสิทธิ์ตารางโดยตรงกว้างเกินจำเป็น
