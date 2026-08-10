-- TKN v5.30.9 PRE-FLIGHT — READ ONLY
with required(table_name,column_name) as (
  values
    ('products','id'),('products','product_code'),('products','barcode'),('products','name'),
    ('products','cost_price'),('products','selling_price'),('products','quantity'),
    ('products','minimum_stock'),('products','is_active'),('products','created_at'),('products','updated_at'),
    ('products','vat_rate'),('products','sku_alias'),('products','allow_negative_stock'),
    ('products','base_sku'),('products','source_barcode'),('products','lot_code'),
    ('products','lot_cost_letter'),('products','product_type_th'),('products','model_name'),
    ('products','label_name'),('products','markup_percent'),('products','vat_mode'),('products','price_rounding'),
    ('stock_boxes','id'),('stock_boxes','box_code'),('stock_boxes','status'),
    ('stock_boxes','location_text'),('stock_boxes','closed_at'),
    ('stock_box_items','box_id'),('stock_box_items','product_id'),('stock_box_items','sku'),('stock_box_items','quantity')
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
select 'function: permission resolver',
  case when to_regprocedure('public.tkn_v5261_has_permission(text)') is not null then 'PASS' else 'FAIL' end
union all
select 'function: waiting snapshot',
  case when to_regprocedure('public.tkn_v5283_close_box_to_waiting(text,uuid,text,text,text)') is not null then 'PASS' else 'FAIL' end
union all
select 'function: warehouse resolver',
  case when to_regprocedure('public.tkn_v5300_warehouse_branch_id()') is not null then 'PASS' else 'FAIL' end
union all
select 'table: tkn_box_history',
  case when to_regclass('public.tkn_box_history') is not null then 'PASS' else 'FAIL' end;

-- ต้องได้ No rows returned:
-- ตรวจ CHECK constraints ของ products ที่อาจไม่รองรับค่ามาตรฐาน EXCLUDED / NONE
select 'BLOCKER: products check constraint' check_name,
       conname||' = '||pg_get_constraintdef(c.oid) result
from pg_constraint c
join pg_class t on t.oid=c.conrelid
join pg_namespace n on n.oid=t.relnamespace
where n.nspname='public' and t.relname='products' and c.contype='c'
  and (
    pg_get_constraintdef(c.oid) ilike '%vat_mode%'
    or pg_get_constraintdef(c.oid) ilike '%price_rounding%'
  )
  and not (
    pg_get_constraintdef(c.oid) ilike '%EXCLUDED%'
    or pg_get_constraintdef(c.oid) ilike '%NONE%'
  );
