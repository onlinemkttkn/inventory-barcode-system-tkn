with last_audit as (select * from public.tkn_v5281_install_audit order by id desc limit 1),checks(name,ok,note) as (
 values
 ('barcode master',to_regclass('public.tkn_product_barcode_master') is not null,'new additive table'),
 ('external identifier mapping',to_regclass('public.tkn_external_product_identifiers') is not null,'multi-source SKU mapping'),
 ('atomic commit ledger',to_regclass('public.tkn_universal_stock_commit_ledger') is not null,'idempotency ledger'),
 ('commit rpc',to_regprocedure('public.tkn_v5281_commit_stock_row(jsonb,jsonb)') is not null,'atomic stock commit'),
 ('resolver rpc',to_regprocedure('public.tkn_v5281_resolve_receiving_exception(uuid,numeric,numeric,text,text,text,numeric)') is not null,'exception resolution'),
 ('scan rpc',to_regprocedure('public.tkn_v5281_register_receiving_scan(uuid,text,numeric)') is not null,'receiving'),
 ('fingerprint unique index',to_regclass('public.uq_tkn_mp_source_fingerprint') is not null,'duplicate protection'),
 ('source line unique index',to_regclass('public.uq_tkn_mp_batch_line_key') is not null,'resume protection'),
 ('barcode policy',exists(select 1 from pg_policies where schemaname='public' and tablename='tkn_product_barcode_master' and policyname='tkn_v5281_barcode_read'),'RLS'),
 ('external policy',exists(select 1 from pg_policies where schemaname='public' and tablename='tkn_external_product_identifiers' and policyname='tkn_v5281_external_read'),'RLS'),
 ('commit policy',exists(select 1 from pg_policies where schemaname='public' and tablename='tkn_universal_stock_commit_ledger' and policyname='tkn_v5281_commit_read'),'RLS'),
 ('validation flags array constraint',exists(select 1 from pg_constraint where conname='tkn_v5281_validation_flags_array'),'constraint'),
 ('core products unchanged',(select count(*) from public.products)=(select products_count from last_audit),'install must not mutate core'),
 ('core inventory unchanged',(select count(*) from public.branch_inventory)=(select branch_inventory_count from last_audit),'install must not mutate core'),
 ('core boxes unchanged',(select count(*) from public.stock_boxes)=(select stock_boxes_count from last_audit),'install must not mutate core'),
 ('core box items unchanged',(select count(*) from public.stock_box_items)=(select stock_box_items_count from last_audit),'install must not mutate core'),
 ('core sales unchanged',(select count(*) from public.sales)=(select sales_count from last_audit),'install must not mutate core'),
 ('core sale items unchanged',(select count(*) from public.sale_items)=(select sale_items_count from last_audit),'install must not mutate core'),
 ('core sorting lots unchanged',(select count(*) from public.sorting_lots)=(select sorting_lots_count from last_audit),'install must not mutate core'),
 ('core sorting items unchanged',(select count(*) from public.sorting_lot_items)=(select sorting_lot_items_count from last_audit),'install must not mutate core'),
 ('core triggers unchanged',(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in('products','branch_inventory','stock_boxes','stock_box_items','sales','sale_items','sorting_lots','sorting_lot_items') and not t.tgisinternal)=(select core_trigger_count from last_audit),'install must not add core triggers')
)
select name,case when ok then 'PASS' else 'STOP' end result,note from checks order by name;
