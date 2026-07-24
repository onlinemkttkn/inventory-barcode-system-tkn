# Master 3.4.9 — Hardware Auto Integration

## หลักการ

ค่าเริ่มต้นคือ `AUTO`

1. ตรวจ Windows Service: `http://127.0.0.1:17890`
2. ถ้าไม่พร้อม ตรวจ PowerShell Bridge: `http://127.0.0.1:17891`
3. ใบเสร็จใช้ Browser Print เป็น fallback
4. ลิ้นชักไม่มี Browser fallback เพื่อป้องกันคำสั่งผิดอุปกรณ์
5. ถ้าลิ้นชักเปิดไม่สำเร็จ บิลที่บันทึกแล้วจะไม่ถูกยกเลิก

## อัป Repository

อัปไฟล์ทั้งหมดในแพ็กไปที่ root และรักษาโครงสร้าง:

- `js/`
- `css/`
- `hardware-service/`
- `powershell-fallback/`

Commit:

`Deploy Master 3.4.9 Hardware Auto Integration`

ไม่ต้องรัน SQL

## ติดตั้ง Windows Service

1. เข้า `hardware-service`
2. Run as administrator: `INSTALL-SERVICE.bat`
3. ตรวจ `http://127.0.0.1:17890/health`
4. รัน `TEST-DRAWER.bat`
5. Restart Windows แล้วตรวจ health อีกครั้ง

## PowerShell สำรอง

PowerShell fallback ใช้พอร์ต `17891` เพื่อไม่ชนกับ Service

1. เข้า `powershell-fallback`
2. Run as administrator: `START-RONGTA-BRIDGE.bat`
3. ตรวจ `http://127.0.0.1:17891/health`

## ตั้งค่าจาก Admin

เปิด `hardware-settings.html`

โหมด:
- AUTO
- SERVICE
- POWERSHELL
- BROWSER

ค่าแนะนำ: AUTO
