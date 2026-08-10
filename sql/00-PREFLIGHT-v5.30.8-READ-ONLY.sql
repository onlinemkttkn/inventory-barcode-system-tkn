-- TKN v5.30.8 PRE-FLIGHT — READ ONLY
with required(table_name,column_name) as (
  values
    ('stock_boxes','id'),('stock_boxes','box_code'),('stock_boxes','status'),
    ('stock_boxes','location_text'),('stock_boxes','closed_at'),
    ('stock_box_items','box_id'),('stock_box_items','product_id'),
    ('stock_box_items','sku'),('stock_box_items','quantity')
)
select 'column: '||table_name||'.'||column_name check_name,
       case when exists(
         select 1 from information_schema.columns c
         where c.table_schema='public'
           and c.table_name=required.table_name
           and c.column_name=required.column_name
       ) then 'PASS' else 'FAIL' end result
from required
union all
select 'function: ensure_sorting_product_lot_v5250',
  case when to_regprocedure('public.ensure_sorting_product_lot_v5250(text,text,text,numeric,numeric,text,text,text)') is not null then 'PASS' else 'FAIL' end
union all
select 'function: tkn_v5283_close_box_to_waiting',
  case when to_regprocedure('public.tkn_v5283_close_box_to_waiting(text,uuid,text,text,text)') is not null then 'PASS' else 'FAIL' end
union all
select 'function: warehouse resolver',
  case when to_regprocedure('public.tkn_v5300_warehouse_branch_id()') is not null then 'PASS' else 'FAIL' end
union all
select 'table: products',case when to_regclass('public.products') is not null then 'PASS' else 'FAIL' end
union all
select 'table: tkn_box_history',case when to_regclass('public.tkn_box_history') is not null then 'PASS' else 'FAIL' end
union all
select 'function: permission resolver',
  case when to_regprocedure('public.tkn_v5261_has_permission(text)') is not null then 'PASS' else 'FAIL' end;


-- IMPORTANT: ต้องไม่มีแถวออกมา
-- แสดง NOT NULL columns ของ stock_boxes / stock_box_items ที่ไม่มี default
-- และ Atomic RPC v5.30.8 ยังไม่ได้ส่งค่าให้
select
  'BLOCKER: required column not handled' as check_name,
  table_name||'.'||column_name as result
from information_schema.columns
where table_schema='public'
  and table_name in ('stock_boxes','stock_box_items')
  and is_nullable='NO'
  and column_default is null
  and not (
    (table_name='stock_boxes' and column_name in ('box_code','status','location_text','closed_at'))
    or
    (table_name='stock_box_items' and column_name in ('box_id','product_id','sku','quantity'))
  )
order by table_name,ordinal_position;
