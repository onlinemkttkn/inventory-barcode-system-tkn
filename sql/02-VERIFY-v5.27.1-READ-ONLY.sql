-- ตรวจหลัง INSTALL ไม่มีคำสั่งเปลี่ยนข้อมูล
with checks(name,passed,detail) as (
  select 'table: tkn_marketplace_import_batches',to_regclass('public.tkn_marketplace_import_batches') is not null,coalesce(to_regclass('public.tkn_marketplace_import_batches')::text,'missing')
  union all select 'table: tkn_marketplace_import_batch_items',to_regclass('public.tkn_marketplace_import_batch_items') is not null,coalesce(to_regclass('public.tkn_marketplace_import_batch_items')::text,'missing')
  union all select 'function: begin batch',to_regprocedure('public.tkn_v5271_begin_import_batch(text,text,text,text)') is not null,coalesce(to_regprocedure('public.tkn_v5271_begin_import_batch(text,text,text,text)')::text,'missing')
  union all select 'function: append items',to_regprocedure('public.tkn_v5271_append_import_items(uuid,jsonb)') is not null,coalesce(to_regprocedure('public.tkn_v5271_append_import_items(uuid,jsonb)')::text,'missing')
  union all select 'function: finalize batch',to_regprocedure('public.tkn_v5271_finalize_import_batch(uuid)') is not null,coalesce(to_regprocedure('public.tkn_v5271_finalize_import_batch(uuid)')::text,'missing')
  union all select 'function: find sorting source',to_regprocedure('public.tkn_v5271_find_sorting_source(text,text)') is not null,coalesce(to_regprocedure('public.tkn_v5271_find_sorting_source(text,text)')::text,'missing')
  union all select 'function: sync sorting progress',to_regprocedure('public.tkn_v5271_sync_sorting_progress(jsonb,boolean)') is not null,coalesce(to_regprocedure('public.tkn_v5271_sync_sorting_progress(jsonb,boolean)')::text,'missing')
  union all select 'unsafe v5.27.0 policies removed',not exists(select 1 from pg_policies where schemaname='public' and policyname in ('tkn_mp_batches_authenticated','tkn_mp_items_authenticated','tkn_mp_category_authenticated','tkn_mp_events_authenticated')),'wide authenticated FOR ALL policies must be absent'
  union all select 'safe read policies present',(select count(*)=4 from pg_policies where schemaname='public' and policyname like 'tkn_v5271_%_read'),'four permission-gated read policies'
)
select case when passed then 'PASS' else 'STOP' end result,name,detail from checks order by passed,name;

-- เปรียบเทียบผลชุดนี้กับ BASELINE; ค่าตารางหลักและ Trigger ต้องเท่าเดิมหากไม่มีผู้ทำรายการระหว่างติดตั้ง
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
