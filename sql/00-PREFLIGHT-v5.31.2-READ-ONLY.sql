-- TKN v5.31.2 PRE-FLIGHT — READ ONLY
select 'stock intake lookup' check_name,case when to_regprocedure('public.tkn_v5285_stock_intake_lookup(text)') is not null then 'PASS' else 'FAIL' end result
union all select 'recent stock intakes',case when to_regprocedure('public.tkn_v5285_recent_stock_intakes(integer)') is not null then 'PASS' else 'FAIL' end
union all select 'stock receive',case when to_regprocedure('public.tkn_v5300_receive_stock_intake(uuid,text,text)') is not null then 'PASS' else 'FAIL' end;
