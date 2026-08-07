with checks(name,required,ok,note) as (
  values
  ('v5.26.1 permission rpc',true,to_regprocedure('public.tkn_v5261_has_permission(text)') is not null,'ต้องมี DB-SAFE v5.26.1'),
  ('v5.27.1 import batches',true,to_regclass('public.tkn_marketplace_import_batches') is not null,'ต้องมี v5.27.1'),
  ('v5.27.1 import items',true,to_regclass('public.tkn_marketplace_import_batch_items') is not null,'ต้องมี v5.27.1'),
  ('v5.27.1 import events',true,to_regclass('public.tkn_marketplace_import_events') is not null,'ต้องมี v5.27.1'),
  ('manual stock rpc',true,exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='manual_import_product_v5_15'),'เส้นทางรับสต็อกเดิม'),
  ('products',true,to_regclass('public.products') is not null,'core'),('branch_inventory',true,to_regclass('public.branch_inventory') is not null,'core'),
  ('stock_boxes',true,to_regclass('public.stock_boxes') is not null,'core'),('stock_box_items',true,to_regclass('public.stock_box_items') is not null,'core'),
  ('sales',true,to_regclass('public.sales') is not null,'core'),('sale_items',true,to_regclass('public.sale_items') is not null,'core'),
  ('sorting_lots',true,to_regclass('public.sorting_lots') is not null,'core'),('sorting_lot_items',true,to_regclass('public.sorting_lot_items') is not null,'core'),
  ('product.manage permission',true,exists(select 1 from public.app_permissions where code='product.manage'),'required permission')
)
select name,required,case when ok then 'PASS' else case when required then 'STOP' else 'INFO' end end result,note from checks order by required desc,name;
