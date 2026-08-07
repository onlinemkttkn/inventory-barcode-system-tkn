-- รันหลัง PREFLIGHT ผ่านครบ และเก็บผลไว้เปรียบเทียบกับ VERIFY
select
  (select count(*) from public.products) as products,
  (select count(*) from public.stock_boxes) as stock_boxes,
  (select count(*) from public.stock_box_items) as stock_box_items,
  (select count(*) from public.sorting_lots) as sorting_lots,
  (select count(*) from public.sorting_lot_items) as sorting_lot_items,
  (select count(*) from public.sales) as sales,
  (select count(*) from public.sale_items) as sale_items,
  (select count(*) from public.branch_inventory) as branch_inventory_rows,
  (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname='public'
      and c.relname in ('products','stock_boxes','stock_box_items','sorting_lots','sorting_lot_items','sales','sale_items','branch_inventory')) as core_triggers;
