-- TKN v5.30.6 PRE-FLIGHT — READ ONLY
select 'stock_boxes' check_name,case when to_regclass('public.stock_boxes') is not null then 'PASS' else 'FAIL' end result
union all select 'stock_box_items',case when to_regclass('public.stock_box_items') is not null then 'PASS' else 'FAIL' end
union all select 'box history',case when to_regclass('public.tkn_box_history') is not null then 'PASS' else 'FAIL' end
union all select 'v5.28.3 close waiting',case when to_regprocedure('public.tkn_v5283_close_box_to_waiting(text,uuid,text,text,text)') is not null then 'PASS' else 'FAIL' end
union all select 'v5.30 warehouse resolver',case when to_regprocedure('public.tkn_v5300_warehouse_branch_id()') is not null then 'PASS' else 'FAIL' end;
