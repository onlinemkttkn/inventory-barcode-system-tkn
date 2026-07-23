# ติดตั้ง Master 3.4 LTS Release Candidate

## ลำดับที่แนะนำ

### 1. อัปโหลดไฟล์เว็บก่อน
อัปโหลดไฟล์ทั้งหมดจาก ZIP ทับ Master 3.3 LTS แล้ว Commit:

```text
Deploy Master 3.4 LTS release candidate frontend
```

ยังไม่ประกาศใช้จริงจนกว่าจะทดสอบครบ

### 2. รัน SQL เพิ่มเฉพาะรายงานช่วงวันที่

```text
sql/UPGRADE-MASTER-3.4-LTS.sql
```

SQL นี้เพิ่ม RPC ใหม่เพียงตัวเดียว ไม่ลบหรือแก้ตารางเดิม:

```text
get_sales_control_dashboard_range_v3_4(date,date,uuid,integer)
```

### 3. ล้าง Cache
รอ GitHub Pages แล้วกด:

```text
Ctrl + Shift + R
```

บนมือถือให้เปิด Private/Incognito หรือ Clear Website Data

### 4. UAT
ทดสอบตาม `docs/UAT-MASTER-3.4-LTS.md`

### 5. เปิดใช้งานจริง
เมื่อ UAT ผ่าน ให้ Commit/Tag:

```text
Release TKN POS ERP Master 3.4 LTS
```

## Rollback
ถ้าพบปัญหา ให้ Restore ไฟล์จาก Commit ของ Master 3.3 LTS
RPC รายงานช่วงวันที่ปล่อยค้างไว้ได้ เพราะไม่กระทบ Flow เดิม
