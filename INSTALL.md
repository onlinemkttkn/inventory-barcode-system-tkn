# Supabase Client Compatibility Fix

## แก้ Error

```text
The requested module './supabase-config.js'
does not provide an export named 'SUPABASE_PUBLISHABLE_KEY'
```

## ติดตั้ง

อัปโหลดไฟล์นี้ทับของเดิม:

```text
js/supabase-client.js
```

ไม่ต้องแก้ `supabase-config.js` และไม่ต้องแก้ `dashboard.html`

Commit:

```text
Fix module Supabase client compatibility
```

หลัง GitHub Pages deploy แล้ว:

```text
Ctrl + Shift + R
```

หน้าคืนสินค้าควรโหลดรายการบิลได้ตามปกติ
