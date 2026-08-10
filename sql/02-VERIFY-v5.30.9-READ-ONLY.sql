-- TKN v5.30.9 VERIFY — READ ONLY
select 'sorting workflow permission RPC' check_name,
case when to_regprocedure('public.tkn_v5309_can_sorting_create_product()') is not null then 'PASS' else 'FAIL' end result
union all
select 'sorting product resolver RPC',
case when to_regprocedure('public.tkn_v5309_resolve_or_create_sorting_product(text,text,numeric,numeric,text,text,text,text,text)') is not null then 'PASS' else 'FAIL' end
union all
select 'atomic box commit RPC',
case when to_regprocedure('public.tkn_v5309_commit_box_to_waiting(text,jsonb,text,text,text)') is not null then 'PASS' else 'FAIL' end
union all
select 'waiting snapshot',
case when to_regprocedure('public.tkn_v5283_close_box_to_waiting(text,uuid,text,text,text)') is not null then 'PASS' else 'FAIL' end
union all
select 'warehouse configured',
case when public.tkn_v5300_warehouse_branch_id() is not null then 'PASS' else 'FAIL' end;

-- หลัง UAT ตรวจว่าสินค้า UAT ถูกสร้างใน master โดย quantity=0
select id,product_code,sku_alias,base_sku,barcode,source_barcode,name,
       cost_price,selling_price,quantity,is_active,vat_rate,vat_mode,price_rounding
from public.products
where upper(coalesce(product_code,'')) like 'UAT5301-%'
   or upper(coalesce(sku_alias,'')) like 'UAT5301-%'
order by product_code;
