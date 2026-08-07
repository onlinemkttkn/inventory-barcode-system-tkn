-- TKN v5.28.4 Preflight — READ ONLY
select 'v5.28.3 box history table' check_name, case when to_regclass('public.tkn_box_history') is not null then 'PASS' else 'FAIL' end result
union all select 'v5.28.3 history items', case when to_regclass('public.tkn_box_history_items') is not null then 'PASS' else 'FAIL' end
union all select 'v5.28.3 print history', case when to_regclass('public.tkn_box_qr_print_history') is not null then 'PASS' else 'FAIL' end
union all select 'v5.28.3 intake ledger', case when to_regclass('public.tkn_box_stock_intake_ledger') is not null then 'PASS' else 'FAIL' end
union all select 'v5.28.3 close function', case when to_regprocedure('public.tkn_v5283_close_box_to_waiting(text,uuid,text,text,text)') is not null then 'PASS' else 'FAIL' end
union all select 'v5.28.3 receive function', case when to_regprocedure('public.tkn_v5283_receive_box_to_stock(text,uuid)') is not null then 'PASS' else 'FAIL' end;
