# วิธีอัปโหลด TKN POS v1.0.0 ขึ้น GitHub Pages

## สำคัญ
อัปโหลด **ไฟล์และโฟลเดอร์ที่อยู่ภายใน** `TKN-POS-v1.0.0-PHASE-09-1`
ไปไว้ที่หน้าแรกของ Repository

โครงสร้างบน GitHub ต้องเป็น:

```text
inventory-barcode-system-tkn/
├── css/
├── js/
├── sql/
├── index.html
├── dashboard.html
├── pos.html
├── suppliers.html
├── purchase-order-create.html
└── purchase-order-history.html
```

ห้ามเป็น:

```text
inventory-barcode-system-tkn/
└── TKN-POS-v1.0.0-PHASE-09-1/
    ├── css/
    ├── js/
    └── dashboard.html
```

## ขั้นตอน
1. เปิดโฟลเดอร์ `TKN-POS-v1.0.0-PHASE-09-1`
2. เลือกไฟล์ทั้งหมดภายใน
3. อัปโหลดทับ Repository เดิม
4. Commit ข้อความ `TKN POS v1.0.0 Phase 9.1`
5. ไปที่ Settings → Pages
6. Source: Deploy from a branch
7. Branch: `main`
8. Folder: `/ (root)`
9. รอ Deploy สำเร็จ
10. เปิดเว็บแล้วกด `Ctrl + Shift + R`

URL:
`https://onlinemkttkn.github.io/inventory-barcode-system-tkn/`
