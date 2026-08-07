-- ============================================================
-- TKN v5.27.1 Marketplace Stock — READ-ONLY PREFLIGHT
-- ไม่มีคำสั่งแก้ไข Schema หรือข้อมูล
-- ต้องได้ PASS ทุกแถวที่เป็น REQUIRED ก่อนรัน INSTALL
-- ============================================================

with required_objects(kind, object_name, exists_ok, detail) as (
  select 'REQUIRED','table: products',to_regclass('public.products') is not null,coalesce(to_regclass('public.products')::text,'missing')
  union all select 'REQUIRED','table: branches',to_regclass('public.branches') is not null,coalesce(to_regclass('public.branches')::text,'missing')
  union all select 'REQUIRED','table: sorting_lots',to_regclass('public.sorting_lots') is not null,coalesce(to_regclass('public.sorting_lots')::text,'missing')
  union all select 'REQUIRED','table: sorting_lot_items',to_regclass('public.sorting_lot_items') is not null,coalesce(to_regclass('public.sorting_lot_items')::text,'missing')
  union all select 'REQUIRED','table: stock_boxes',to_regclass('public.stock_boxes') is not null,coalesce(to_regclass('public.stock_boxes')::text,'missing')
  union all select 'REQUIRED','table: stock_box_items',to_regclass('public.stock_box_items') is not null,coalesce(to_regclass('public.stock_box_items')::text,'missing')
  union all select 'REQUIRED','table: branch_inventory',to_regclass('public.branch_inventory') is not null,coalesce(to_regclass('public.branch_inventory')::text,'missing')
  union all select 'REQUIRED','table: sales',to_regclass('public.sales') is not null,coalesce(to_regclass('public.sales')::text,'missing')
  union all select 'REQUIRED','table: sale_items',to_regclass('public.sale_items') is not null,coalesce(to_regclass('public.sale_items')::text,'missing')
  union all select 'REQUIRED','table: app_permissions',to_regclass('public.app_permissions') is not null,coalesce(to_regclass('public.app_permissions')::text,'missing')
  union all select 'REQUIRED','function: tkn_v5261_has_permission(text)',to_regprocedure('public.tkn_v5261_has_permission(text)') is not null,coalesce(to_regprocedure('public.tkn_v5261_has_permission(text)')::text,'missing')
  union all select 'REQUIRED','function: current_access_context()',to_regprocedure('public.current_access_context()') is not null,coalesce(to_regprocedure('public.current_access_context()')::text,'missing')
  union all select 'REQUIRED','function: gen_random_uuid()',to_regprocedure('gen_random_uuid()') is not null,coalesce(to_regprocedure('gen_random_uuid()')::text,'missing')
  union all select 'INFO','v5.27.0 tables already exist',to_regclass('public.tkn_marketplace_import_batches') is not null,'PASS means installer will preserve rows and repair policies'
),
required_columns(table_name,column_name) as (
  values
    ('products','id'),('products','product_code'),('products','barcode'),('products','name'),('products','cost_price'),('products','selling_price'),
    ('branches','id'),('branches','code'),('branches','name'),('branches','is_active'),
    ('sorting_lots','id'),('sorting_lots','lot_code'),('sorting_lots','tracking_number'),
    ('sorting_lot_items','lot_id'),('sorting_lot_items','source_item_id'),('sorting_lot_items','quantity'),
    ('stock_boxes','id'),('stock_boxes','box_code'),('stock_boxes','status'),
    ('stock_box_items','box_id'),('stock_box_items','product_id'),('stock_box_items','sku'),('stock_box_items','quantity')
),
column_checks as (
  select 'REQUIRED'::text kind,
         'column: '||r.table_name||'.'||r.column_name object_name,
         exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=r.table_name and c.column_name=r.column_name) exists_ok,
         'required by v5.27.1'::text detail
  from required_columns r
)
select kind,
       case when exists_ok then 'PASS' else case when kind='INFO' then 'INFO' else 'STOP' end end as result,
       object_name,
       detail
from (
  select * from required_objects
  union all
  select * from column_checks
) checks
order by case kind when 'REQUIRED' then 0 else 1 end, exists_ok, object_name;

-- เมื่อ REQUIRED ทุกแถวเป็น PASS แล้ว จึงรันไฟล์ 00A-BASELINE-v5.27.1-READ-ONLY.sql
