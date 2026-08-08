-- TKN v5.30.0 PRE-FLIGHT — READ ONLY
select 'box history' check_name, case when to_regclass('public.tkn_box_history') is not null then 'PASS' else 'FAIL' end result
union all select 'box history items',case when to_regclass('public.tkn_box_history_items') is not null then 'PASS' else 'FAIL' end
union all select 'stock intake ledger',case when to_regclass('public.tkn_box_stock_intake_ledger') is not null then 'PASS' else 'FAIL' end
union all select 'v5.28.3 close waiting',case when to_regprocedure('public.tkn_v5283_close_box_to_waiting(text,uuid,text,text,text)') is not null then 'PASS' else 'FAIL' end
union all select 'v5.28.5 intake',case when to_regprocedure('public.tkn_v5285_receive_stock_intake(uuid,uuid,text,text)') is not null then 'PASS' else 'FAIL' end
union all select 'receive branch inventory',case when to_regprocedure('public.receive_branch_inventory(uuid,jsonb,text,text,text,text)') is not null then 'PASS' else 'FAIL' end
union all select 'box location tracking',case when to_regprocedure('public.tkn_v5261_register_box_location(text,uuid,text)') is not null then 'PASS' else 'FAIL' end
union all select 'โกดังเก็บสินค้า active',case when exists(
  select 1 from public.branches where is_active=true and (
    lower(regexp_replace(coalesce(name,''),'[\\s_-]+','','g')) like '%โกดังเก็บสินค้า%'
    or lower(regexp_replace(coalesce(name,''),'[\\s_-]+','','g')) like '%โกดัง%'
    or upper(coalesce(code,'')) in ('WAREHOUSE','WH','WH-MAIN','WAREHOUSE-MAIN')
  )
) then 'PASS' else 'FAIL' end;