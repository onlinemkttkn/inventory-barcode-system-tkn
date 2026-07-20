# Phase 9.2 — Module 2.2
## Supabase Client กลาง

## ไฟล์

```text
js/supabase-config.js
js/supabase-client.js
js/phase-9-2-bill-search.js
docs/PHASE-09-2-MODULE-02-2-SUPABASE-CLIENT.md
```

## ติดตั้ง

1. อัปโหลดไฟล์ `supabase-config.js` และ `supabase-client.js` เข้าโฟลเดอร์ `js/`
2. ใช้ไฟล์ `phase-9-2-bill-search.js` ใหม่นี้แทนไฟล์เดิม
3. Commit:

```text
Phase 9.2 - Add shared Supabase client
```

4. รอ GitHub Pages deploy
5. เปิด:

```text
phase-9-2-bill-search.html
```

## ผลที่ควรได้

- จำนวนบิลเปลี่ยนจาก 0 เป็นข้อมูลจากตาราง `sales`
- ตารางแสดงเลขบิลจริง
- ค้นด้วยเลขบิลได้
- กดดูรายละเอียดแล้วแสดงข้อมูลจาก `sale_items`

## หากหน้าไม่โหลดข้อมูล

เปิด Developer Tools:

```text
F12 → Console
```

ส่งข้อความ Error มาให้ตรวจ

## ความปลอดภัย

ไฟล์ใช้ Publishable Key สำหรับ Browser เท่านั้น  
ห้ามเปลี่ยนเป็น `service_role` key
