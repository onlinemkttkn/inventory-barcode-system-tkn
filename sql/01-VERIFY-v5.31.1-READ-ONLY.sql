-- TKN v5.31.1 VERIFY — READ ONLY
select 'box inspection dependencies' check_name,
case when to_regprocedure('public.tkn_v5285_stock_intake_lookup(text)') is not null
  and to_regprocedure('public.tkn_v5285_recent_stock_intakes(integer)') is not null
then 'PASS' else 'FAIL' end result;
