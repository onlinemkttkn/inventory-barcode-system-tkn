# วิธีอัปโหลดขึ้น GitHub

แตก ZIP แล้วอัปโหลด **ไฟล์และโฟลเดอร์ด้านในทั้งหมด** ไปที่ Root ของ Repository

โครงสร้างที่ถูกต้อง:

```text
tkn-pos-v1/
├── .nojekyll
├── index.html
├── dashboard.html
├── css/
├── js/
├── sql/
├── assets/
├── docs/
└── manifest.webmanifest
```

ห้ามนำไฟล์ใน `css/` หรือ `js/` ออกมาไว้ที่ Root

หลังอัปโหลด:
1. Settings → Pages
2. Deploy from a branch
3. Branch `main`
4. Folder `/(root)`
5. รอ Deploy สีเขียว
6. เปิด `https://onlinemkttkn.github.io/tkn-pos-v1/`
7. กด `Ctrl + Shift + R`
