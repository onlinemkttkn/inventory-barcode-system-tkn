-- TKN v5.28.7 FINAL CLEAN — READ ONLY
select 'waiting queue RPC' check_name, case when to_regprocedure('public.tkn_v5284_list_waiting_box_queue(text,integer)') is not null then 'PASS' else 'FAIL' end result
union all select 'stock intake lookup RPC', case when to_regprocedure('public.tkn_v5285_stock_intake_lookup(text)') is not null then 'PASS' else 'FAIL' end
union all select 'stock intake receive RPC', case when to_regprocedure('public.tkn_v5285_receive_stock_intake(uuid,uuid,text,text)') is not null then 'PASS' else 'FAIL' end
union all select 'box history table', case when to_regclass('public.tkn_box_history') is not null then 'PASS' else 'FAIL' end
union all select 'stock intake ledger', case when to_regclass('public.tkn_box_stock_intake_ledger') is not null then 'PASS' else 'FAIL' end;

select workflow_status,count(*) boxes from public.tkn_box_history group by workflow_status order by workflow_status;
