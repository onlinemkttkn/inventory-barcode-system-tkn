select 'products' metric,count(*) value from public.products union all
select 'branch_inventory',count(*) from public.branch_inventory union all
select 'stock_boxes',count(*) from public.stock_boxes union all
select 'stock_box_items',count(*) from public.stock_box_items union all
select 'sales',count(*) from public.sales union all
select 'sale_items',count(*) from public.sale_items union all
select 'sorting_lots',count(*) from public.sorting_lots union all
select 'sorting_lot_items',count(*) from public.sorting_lot_items union all
select 'core_triggers',count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in('products','branch_inventory','stock_boxes','stock_box_items','sales','sale_items','sorting_lots','sorting_lot_items') and not t.tgisinternal;
