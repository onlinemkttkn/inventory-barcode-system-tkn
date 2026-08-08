-- TKN v5.30.0 VERIFY — READ ONLY
select 'warehouse resolver' check_name,case when to_regprocedure('public.tkn_v5300_warehouse_branch()') is not null then 'PASS' else 'FAIL' end result
union all select 'close -> stock intake',case when to_regprocedure('public.tkn_v5300_close_box_to_stock_intake(text,text,text,text)') is not null then 'PASS' else 'FAIL' end
union all select 'stock intake -> putaway',case when to_regprocedure('public.tkn_v5300_receive_stock_intake(uuid,text,text)') is not null then 'PASS' else 'FAIL' end
union all select 'putaway queue',case when to_regprocedure('public.tkn_v5300_list_putaway_queue(text,integer)') is not null then 'PASS' else 'FAIL' end
union all select 'putaway lookup',case when to_regprocedure('public.tkn_v5300_putaway_lookup(text)') is not null then 'PASS' else 'FAIL' end
union all select 'putaway commit',case when to_regprocedure('public.tkn_v5300_putaway_box(uuid,text,text)') is not null then 'PASS' else 'FAIL' end
union all select 'putaway table',case when to_regclass('public.tkn_box_putaway_tasks') is not null then 'PASS' else 'FAIL' end
union all select 'warehouse configured',case when public.tkn_v5300_warehouse_branch_id() is not null then 'PASS' else 'FAIL' end;

select workflow_status,count(*) boxes from public.tkn_box_history group by workflow_status order by workflow_status;
select status,count(*) boxes from public.tkn_box_putaway_tasks group by status order by status;