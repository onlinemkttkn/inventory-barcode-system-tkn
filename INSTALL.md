# Dashboard Supabase Config Fix

## ปัญหาเดิม

```text
Uncaught SyntaxError: Unexpected token 'export'
```

เกิดจาก `supabase-config.js` ใช้ ES module แต่ `dashboard.html`
โหลดด้วย `<script>` ธรรมดา

## วิธีติดตั้ง

1. อัปโหลด `js/supabase-config.js` ทับไฟล์เดิม
2. Commit: `Fix dashboard Supabase config compatibility`
3. รอ GitHub Pages 1–3 นาที
4. เปิด Dashboard แล้วกด `Ctrl + Shift + R`

## ลำดับ Script ที่ถูกต้อง

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="./js/supabase-config.js?v=1.0.3"></script>
<script src="./js/dashboard-v2.js?v=1.0.3"></script>
```
