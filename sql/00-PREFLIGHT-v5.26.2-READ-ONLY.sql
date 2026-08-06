-- ============================================================
-- TKN v5.26.2 PRE-FLIGHT — READ ONLY
-- ไม่มีคำสั่งแก้ไขฐานข้อมูล
-- ============================================================

select check_name,status,detail
from (values
 ('cashier_shifts',case when to_regclass('public.cashier_shifts') is not null then 'PASS' else 'FAIL' end,'ระบบกะแคชเชียร์'),
 ('cashier_profiles',case when to_regclass('public.cashier_profiles') is not null then 'PASS' else 'FAIL' end,'รหัสพนักงาน/PIN'),
 ('RBAC tables',case when to_regclass('public.app_user_roles') is not null and to_regclass('public.app_roles') is not null and to_regclass('public.app_role_permissions') is not null and to_regclass('public.app_permissions') is not null then 'PASS' else 'FAIL' end,'ระบบบทบาทและ Permission'),
 ('user_has_permission',case when to_regprocedure('public.user_has_permission(text,uuid)') is not null then 'PASS' else 'FAIL' end,'ตรวจสิทธิ์ตาม user_id ของรหัสพนักงาน'),
 ('v5.26.1 start',case when to_regprocedure('public.tkn_v5261_box_sale_start(uuid)') is not null then 'PASS' else 'FAIL' end,'ฐานขายยกกล่อง v5.26.1'),
 ('v5.26.1 complete',case when to_regprocedure('public.tkn_v5261_complete_box_sale(uuid,text,numeric,text,numeric,text,text,text)') is not null then 'PASS' else 'FAIL' end,'ฐานยืนยันขายยกกล่อง v5.26.1'),
 ('create_pos_sale',case when to_regprocedure('public.create_pos_sale(uuid,jsonb,numeric,text,numeric,text,text,text)') is not null then 'PASS' else 'FAIL' end,'POS เดิมสำหรับบันทึกขายและตัดสต็อก')
) as x(check_name,status,detail)
order by check_name;

select required_column,
       case when exists(
         select 1 from information_schema.columns
         where table_schema='public' and table_name=split_part(required_column,'.',1)
           and column_name=split_part(required_column,'.',2)
       ) then 'PASS' else 'FAIL' end as status
from unnest(array[
 'cashier_shifts.id','cashier_shifts.cashier_user_id','cashier_shifts.employee_code',
 'cashier_shifts.branch_id','cashier_shifts.opened_by','cashier_shifts.status',
 'cashier_profiles.user_id','cashier_profiles.employee_code','cashier_profiles.display_name',
 'cashier_profiles.branch_id','cashier_profiles.is_active',
 'app_roles.id','app_roles.code','app_roles.name_th','app_roles.sort_order','app_roles.is_active',
 'app_user_roles.user_id','app_user_roles.role_id','app_user_roles.is_active'
]::text[]) as required_column
order by required_column;

-- Permission matrix ที่ v5.26.1 ควรเตรียมไว้แล้ว
select r.code as role_code,p.code as permission_code,
       case when rp.role_id is not null then 'PASS' else 'MISSING' end as status
from public.app_roles r
cross join public.app_permissions p
left join public.app_role_permissions rp on rp.role_id=r.id and rp.permission_id=p.id
where r.code in ('owner','admin','manager','secretary','supervisor')
  and p.code in ('pos.box_sale.create','pos.box_sale.lump_price')
order by r.code,p.code;

-- BASELINE: บันทึกผลก่อนติดตั้งไว้เปรียบเทียบกับ VERIFY
select 'stock_boxes' as object_name,count(*)::bigint as row_count from public.stock_boxes
union all select 'stock_box_items',count(*)::bigint from public.stock_box_items
union all select 'branch_inventory',count(*)::bigint from public.branch_inventory
union all select 'sales',count(*)::bigint from public.sales
union all select 'sale_items',count(*)::bigint from public.sale_items
order by object_name;

select c.relname as core_table,
       count(*) filter(where not t.tgisinternal) as custom_trigger_count
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
left join pg_trigger t on t.tgrelid=c.oid
where n.nspname='public'
  and c.relname in('stock_boxes','stock_box_items','sales','sale_items','branch_inventory','transfer_documents','transfer_items')
group by c.relname
order by c.relname;
