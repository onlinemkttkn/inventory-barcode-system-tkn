-- VERIFY PHASE 07.6C (READ ONLY)

-- 1) ตรวจ RPC ที่หน้าเว็บใช้
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'receive_branch_inventory',
    'issue_branch_inventory',
    'create_branch_stock_document',
    'receive_inventory',
    'issue_inventory'
  )
order by p.proname;

-- 2) authenticated ต้องเรียกได้เฉพาะ RPC ระบุสาขา
select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in (
    'receive_branch_inventory',
    'issue_branch_inventory',
    'create_branch_stock_document',
    'receive_inventory',
    'issue_inventory'
  )
order by routine_name, grantee;

-- 3) ตรวจสิทธิ์ผู้ใช้ปัจจุบัน
select public.current_access_context() as current_access;

-- ผลที่ต้องการ:
-- authenticated = EXECUTE ที่ receive_branch_inventory และ issue_branch_inventory
-- authenticated ไม่มี EXECUTE ที่ create_branch_stock_document / receive_inventory / issue_inventory
-- anon และ PUBLIC ไม่มี EXECUTE ทุก RPC แก้สต็อกข้างต้น
