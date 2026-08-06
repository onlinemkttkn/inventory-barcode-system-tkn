-- ============================================================
-- TKN v5.26.2 VERIFY — READ ONLY
-- เปรียบเทียบ Core Counts/Trigger Counts กับผล PRE-FLIGHT
-- ============================================================

select object_name,status
from(values
 ('draft_shift_table',case when to_regclass('public.tkn_v5262_box_sale_draft_shifts') is not null then 'PASS' else 'FAIL' end),
 ('access',case when to_regprocedure('public.tkn_v5262_cashier_box_sale_access(uuid)') is not null then 'PASS' else 'FAIL' end),
 ('assert',case when to_regprocedure('public.tkn_v5262_cashier_box_sale_assert(uuid,text)') is not null then 'PASS' else 'FAIL' end),
 ('start',case when to_regprocedure('public.tkn_v5262_box_sale_start(uuid,uuid)') is not null then 'PASS' else 'FAIL' end),
 ('preview',case when to_regprocedure('public.tkn_v5262_box_sale_preview(uuid,uuid)') is not null then 'PASS' else 'FAIL' end),
 ('add_box',case when to_regprocedure('public.tkn_v5262_box_sale_add_box(uuid,uuid,text)') is not null then 'PASS' else 'FAIL' end),
 ('remove_box',case when to_regprocedure('public.tkn_v5262_box_sale_remove_box(uuid,uuid,text)') is not null then 'PASS' else 'FAIL' end),
 ('cancel',case when to_regprocedure('public.tkn_v5262_box_sale_cancel(uuid,uuid)') is not null then 'PASS' else 'FAIL' end),
 ('complete',case when to_regprocedure('public.tkn_v5262_complete_box_sale(uuid,uuid,text,numeric,text,numeric,text,text,text)') is not null then 'PASS' else 'FAIL' end)
) as x(object_name,status)
order by object_name;

select relrowsecurity as rls_enabled,
       (select count(*) from pg_policy where polrelid='public.tkn_v5262_box_sale_draft_shifts'::regclass) as direct_policy_count,
       has_table_privilege('authenticated','public.tkn_v5262_box_sale_draft_shifts','SELECT') as authenticated_direct_select
from pg_class
where oid='public.tkn_v5262_box_sale_draft_shifts'::regclass;

-- Core Counts ต้องเท่ากับ PRE-FLIGHT หากยังไม่มีผู้ใช้งานทำรายการระหว่างติดตั้ง
select 'stock_boxes' as object_name,count(*)::bigint as row_count from public.stock_boxes
union all select 'stock_box_items',count(*)::bigint from public.stock_box_items
union all select 'branch_inventory',count(*)::bigint from public.branch_inventory
union all select 'sales',count(*)::bigint from public.sales
union all select 'sale_items',count(*)::bigint from public.sale_items
order by object_name;

-- Trigger Counts ต้องเท่ากับ PRE-FLIGHT
select c.relname as core_table,
       count(*) filter(where not t.tgisinternal) as custom_trigger_count
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
left join pg_trigger t on t.tgrelid=c.oid
where n.nspname='public'
  and c.relname in('stock_boxes','stock_box_items','sales','sale_items','branch_inventory','transfer_documents','transfer_items')
group by c.relname
order by c.relname;
