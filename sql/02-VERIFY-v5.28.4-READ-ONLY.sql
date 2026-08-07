-- TKN v5.28.4 Verify — READ ONLY
select 'lifecycle table' check_name,case when to_regclass('public.tkn_box_lifecycle_events') is not null then 'PASS' else 'FAIL' end result
union all select 'waiting queue function',case when to_regprocedure('public.tkn_v5284_list_waiting_box_queue(text,integer)') is not null then 'PASS' else 'FAIL' end
union all select 'lifecycle detail function',case when to_regprocedure('public.tkn_v5284_box_lifecycle_detail(uuid)') is not null then 'PASS' else 'FAIL' end
union all select 'history event trigger',case when exists(select 1 from pg_trigger where tgname='trg_tkn_v5284_box_history_event' and not tgisinternal) then 'PASS' else 'FAIL' end
union all select 'print event trigger',case when exists(select 1 from pg_trigger where tgname='trg_tkn_v5284_box_print_event' and not tgisinternal) then 'PASS' else 'FAIL' end
union all select 'intake event trigger',case when exists(select 1 from pg_trigger where tgname='trg_tkn_v5284_box_intake_event' and not tgisinternal) then 'PASS' else 'FAIL' end;

select
 (select count(*) from public.tkn_box_history) as box_history_rows,
 (select count(*) from public.tkn_box_lifecycle_events) as lifecycle_event_rows,
 (select count(*) from public.tkn_box_history where workflow_status='WAITING_STOCK') as waiting_stock_boxes,
 (select count(*) from public.tkn_box_stock_intake_ledger) as stock_intake_rows;
