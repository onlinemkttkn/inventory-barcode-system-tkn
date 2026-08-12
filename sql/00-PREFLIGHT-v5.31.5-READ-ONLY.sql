-- TKN v5.31.5 — PRE-FLIGHT READ ONLY
-- ไม่แก้ข้อมูล ตรวจ dependency สำหรับประเภทกล่อง + เบิกทั้งกล่องเข้า POS

select * from (
  values
    ('stock_boxes', case when to_regclass('public.stock_boxes') is not null then 'PASS' else 'FAIL' end),
    ('stock_box_items', case when to_regclass('public.stock_box_items') is not null then 'PASS' else 'FAIL' end),
    ('branch_inventory', case when to_regclass('public.branch_inventory') is not null then 'PASS' else 'FAIL' end),
    ('products', case when to_regclass('public.products') is not null then 'PASS' else 'FAIL' end),
    ('tkn_box_history', case when to_regclass('public.tkn_box_history') is not null then 'PASS' else 'FAIL' end),
    ('tkn_box_history_items', case when to_regclass('public.tkn_box_history_items') is not null then 'PASS' else 'FAIL' end),
    ('tkn_v5261_box_tracking', case when to_regclass('public.tkn_v5261_box_tracking') is not null then 'PASS' else 'FAIL' end),
    ('tkn_v5261_product_stock_position', case when to_regclass('public.tkn_v5261_product_stock_position') is not null then 'PASS' else 'FAIL' end),
    ('tkn_v5261_get_box_context(text)', case when to_regprocedure('public.tkn_v5261_get_box_context(text)') is not null then 'PASS' else 'FAIL' end),
    ('tkn_v5261_issue_box_to_storefront(text,uuid)', case when to_regprocedure('public.tkn_v5261_issue_box_to_storefront(text,uuid)') is not null then 'PASS' else 'FAIL' end),
    ('tkn_v5261_has_permission(text)', case when to_regprocedure('public.tkn_v5261_has_permission(text)') is not null then 'PASS' else 'FAIL' end),
    ('tkn_v5261_resolve_branch(uuid)', case when to_regprocedure('public.tkn_v5261_resolve_branch(uuid)') is not null then 'PASS' else 'FAIL' end),
    ('tkn_v5283_close_box_to_waiting(text,uuid,text,text,text)', case when to_regprocedure('public.tkn_v5283_close_box_to_waiting(text,uuid,text,text,text)') is not null then 'PASS' else 'FAIL' end),
    ('tkn_v5309_commit_box_to_waiting(text,jsonb,text,text,text)', case when to_regprocedure('public.tkn_v5309_commit_box_to_waiting(text,jsonb,text,text,text)') is not null then 'PASS' else 'FAIL' end),
    ('tkn_v5309_can_sorting_create_product()', case when to_regprocedure('public.tkn_v5309_can_sorting_create_product()') is not null then 'PASS' else 'FAIL' end),
    ('tkn_v5300_warehouse_branch_id()', case when to_regprocedure('public.tkn_v5300_warehouse_branch_id()') is not null then 'PASS' else 'FAIL' end)
) as x(check_name,result)
order by check_name;

-- ต้องรองรับ REOPENED เพื่อให้กล่องหมุนเวียนกลับมาใช้รอบใหม่
select conname as constraint_name, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid='public.tkn_box_history'::regclass and contype='c'
order by conname;

-- ตัวอย่างกล่อง IN_STOCK ล่าสุดก่อนติดตั้ง
select h.box_code,h.revision,h.workflow_status,h.category_text,h.zone_code,h.sku_count,h.total_quantity,
       t.branch_id,t.location_state,t.active_transfer_id
from public.tkn_box_history h
left join public.tkn_v5261_box_tracking t on t.box_id=h.box_id
where h.workflow_status='IN_STOCK'
order by h.updated_at desc
limit 20;
