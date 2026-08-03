# Final v5.19.0 — Unified App Shell

รุ่นนี้รวมเมนู Desktop, Tablet และ Mobile ให้ใช้โครงสร้างเดียวกัน พร้อมกรองเมนูและป้องกันการเปิดฟังก์ชันตามสิทธิ์ของบัญชีผู้ใช้

## จุดสำคัญ

- Desktop Sidebar และ Mobile Menu สร้างจาก Route Registry ชุดเดียวกัน
- ใช้ไอคอน SVG ภายในระบบ ไม่ต้องโหลด Icon CDN
- Dashboard/Home บนมือถือไม่แสดงปุ่มย้อนกลับ
- หน้าย่อยแสดงปุ่มย้อนกลับขนาดเล็กด้านซ้ายบน
- Mobile Menu มีปุ่มออกจากระบบและติดตั้ง PWA
- Breakpoint สำหรับ Tablet/Mobile คือ 1024px
- รายการเมนูถูกกรองตามสิทธิ์รายฟังก์ชัน
- ถ้าเปิด URL ของฟังก์ชันที่ไม่มีสิทธิ์ ระบบจะพากลับหน้า Landing Page
- ไม่แก้ SQL, ราคา, สต็อก หรือข้อมูลธุรกิจ

## ไฟล์แกนหลัก

- `js/app-shell-v5-19.js`
- `css/app-shell-v5-19.css`
- `css/ui-modern-v5-19.css`
- `service-worker-v5.19.0.js`
- `manifest.webmanifest`
