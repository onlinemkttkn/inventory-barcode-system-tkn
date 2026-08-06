-- ============================================================
-- TKN v5.26.1 DB-SAFE — POST-INSTALL VERIFY (READ ONLY)
-- มีเฉพาะ SELECT ไม่มีการแก้ข้อมูลหรือ Schema
-- ============================================================

with expected_objects(object_type,object_name,exists_ok) as (
  values
    ('table','tkn_v5261_box_tracking',to_regclass('public.tkn_v5261_box_tracking') is not null),
    ('table','tkn_v5261_box_cycles',to_regclass('public.tkn_v5261_box_cycles') is not null),
    ('table','tkn_v5261_box_cycle_items',to_regclass('public.tkn_v5261_box_cycle_items') is not null),
    ('table','tkn_v5261_box_movements',to_regclass('public.tkn_v5261_box_movements') is not null),
    ('table','tkn_v5261_box_transfer_links',to_regclass('public.tkn_v5261_box_transfer_links') is not null),
    ('table','tkn_v5261_box_sale_drafts',to_regclass('public.tkn_v5261_box_sale_drafts') is not null),
    ('table','tkn_v5261_box_sales',to_regclass('public.tkn_v5261_box_sales') is not null),
    ('view','tkn_v5261_box_item_locations',to_regclass('public.tkn_v5261_box_item_locations') is not null),
    ('view','tkn_v5261_product_stock_position',to_regclass('public.tkn_v5261_product_stock_position') is not null),
    ('function','tkn_v5261_get_box_context',to_regprocedure('public.tkn_v5261_get_box_context(text)') is not null),
    ('function','tkn_v5261_issue_box_to_storefront',to_regprocedure('public.tkn_v5261_issue_box_to_storefront(text,uuid)') is not null),
    ('function','tkn_v5261_transfer_whole_box',to_regprocedure('public.tkn_v5261_transfer_whole_box(text,uuid,uuid,text)') is not null),
    ('function','tkn_v5261_receive_whole_box',to_regprocedure('public.tkn_v5261_receive_whole_box(text,uuid)') is not null),
    ('function','tkn_v5261_complete_box_sale',to_regprocedure('public.tkn_v5261_complete_box_sale(uuid,text,numeric,text,numeric,text,text,text)') is not null)
)
select case when exists_ok then 'PASS' else 'STOP' end as result,
       object_type,
       object_name
from expected_objects
order by exists_ok,object_type,object_name;

-- ต้องเป็น 0: Patch DB-SAFE ไม่ติด Trigger บนตารางหลัก
select count(*) as v5261_triggers_on_core_tables
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal
  and n.nspname='public'
  and c.relname in ('stock_boxes','stock_box_items','sales','sale_items','branch_inventory','transfer_documents','transfer_items')
  and t.tgname like '%v5261%';

-- ต้องเป็น 0: Trigger เสี่ยงจาก v5.26.0 รุ่นเดิม
select count(*) as unsafe_v5260_triggers
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal
  and n.nspname='public'
  and t.tgname in (
    'trg_tkn_guard_box_header_mutation',
    'trg_tkn_guard_in_transit_box_items',
    'trg_tkn_guard_linked_box_transfer_status',
    'trg_tkn_sale_item_storefront_sync',
    'trg_tkn_void_sale_storefront_restore',
    'trg_tkn_box_item_storefront_sync'
  );

-- CORE COUNTS: หากยังไม่ได้ทำรายการธุรกิจหลังติดตั้ง ควรเท่ากับ BASELINE จาก 00-PREFLIGHT
select
  (select count(*) from public.stock_boxes) as existing_boxes,
  (select count(*) from public.stock_box_items) as existing_box_items,
  (select count(*) from public.sales) as existing_sales,
  (select count(*) from public.sale_items) as existing_sale_items,
  (select count(*) from public.branch_inventory) as existing_branch_inventory_rows,
  (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname='public'
      and c.relname in ('stock_boxes','stock_box_items','sales','sale_items','branch_inventory','transfer_documents','transfer_items'))
    as existing_core_triggers;
