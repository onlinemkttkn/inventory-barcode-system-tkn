begin;

DO $preflight$
begin
  if to_regprocedure('public.tkn_v5261_has_permission(text)') is null then raise exception 'STOP: ต้องมี v5.26.1 DB-SAFE'; end if;
  if to_regclass('public.tkn_marketplace_import_batches') is null or to_regclass('public.tkn_marketplace_import_batch_items') is null or to_regclass('public.tkn_marketplace_import_events') is null then raise exception 'STOP: ต้องติดตั้ง v5.27.1 ก่อน'; end if;
  if to_regprocedure('public.manual_import_product_v5_15(text,text,text,text,text,text,numeric,numeric,numeric,boolean,numeric,numeric,boolean,text,numeric,text,text,text,text,boolean,text)') is null
     and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='manual_import_product_v5_15') then
    raise exception 'STOP: ไม่พบ manual_import_product_v5_15';
  end if;
  if not exists(select 1 from public.app_permissions where code='product.manage') then raise exception 'STOP: ไม่พบ product.manage'; end if;
end $preflight$;

-- Audit snapshot: บันทึกจำนวนข้อมูลหลักก่อนติดตั้งเพื่อใช้ VERIFY หลังติดตั้ง
create table if not exists public.tkn_v5281_install_audit(
  id bigserial primary key,
  installed_at timestamptz not null default now(),
  installed_by uuid default auth.uid(),
  products_count bigint not null,
  branch_inventory_count bigint not null,
  stock_boxes_count bigint not null,
  stock_box_items_count bigint not null,
  sales_count bigint not null,
  sale_items_count bigint not null,
  sorting_lots_count bigint not null,
  sorting_lot_items_count bigint not null,
  core_trigger_count bigint not null
);
insert into public.tkn_v5281_install_audit(products_count,branch_inventory_count,stock_boxes_count,stock_box_items_count,sales_count,sale_items_count,sorting_lots_count,sorting_lot_items_count,core_trigger_count)
select
  (select count(*) from public.products),
  (select count(*) from public.branch_inventory),
  (select count(*) from public.stock_boxes),
  (select count(*) from public.stock_box_items),
  (select count(*) from public.sales),
  (select count(*) from public.sale_items),
  (select count(*) from public.sorting_lots),
  (select count(*) from public.sorting_lot_items),
  (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in('products','branch_inventory','stock_boxes','stock_box_items','sales','sale_items','sorting_lots','sorting_lot_items') and not t.tgisinternal);

-- เพิ่มเฉพาะโครงสร้าง Import/Receiving ไม่แก้ข้อมูลตารางหลัก
alter table public.tkn_marketplace_import_batches drop constraint if exists tkn_marketplace_import_batches_source_check;
alter table public.tkn_marketplace_import_batches add constraint tkn_marketplace_import_batches_source_check check (source ~ '^[A-Z0-9_-]{2,30}$');
alter table public.tkn_marketplace_import_batches add column if not exists source_template text;
alter table public.tkn_marketplace_import_batches add column if not exists source_filename text;
alter table public.tkn_marketplace_import_batches add column if not exists validation_summary jsonb not null default '{}'::jsonb;

alter table public.tkn_marketplace_import_batch_items add column if not exists source_sheet text;
alter table public.tkn_marketplace_import_batch_items add column if not exists source_batch text;
alter table public.tkn_marketplace_import_batch_items add column if not exists source_box text;
alter table public.tkn_marketplace_import_batch_items add column if not exists source_unit_cost numeric;
alter table public.tkn_marketplace_import_batch_items add column if not exists source_total_cost numeric;
alter table public.tkn_marketplace_import_batch_items add column if not exists source_category text;
alter table public.tkn_marketplace_import_batch_items add column if not exists source_subcategory text;
alter table public.tkn_marketplace_import_batch_items add column if not exists source_status text;
alter table public.tkn_marketplace_import_batch_items add column if not exists source_shop text;
alter table public.tkn_marketplace_import_batch_items add column if not exists source_business text;
alter table public.tkn_marketplace_import_batch_items add column if not exists validation_flags jsonb not null default '[]'::jsonb;
alter table public.tkn_marketplace_import_batch_items add column if not exists stock_committed_quantity numeric not null default 0;
DO $$ begin
  if not exists(select 1 from pg_constraint where conname='tkn_v5281_validation_flags_array') then
    alter table public.tkn_marketplace_import_batch_items add constraint tkn_v5281_validation_flags_array check (jsonb_typeof(validation_flags)='array');
  end if;
  if not exists(select 1 from pg_constraint where conname='tkn_v5281_stock_committed_nonnegative') then
    alter table public.tkn_marketplace_import_batch_items add constraint tkn_v5281_stock_committed_nonnegative check (stock_committed_quantity>=0);
  end if;
end $$;

-- Product barcode master แยกออกจาก External SKU mapping
create table if not exists public.tkn_product_barcode_master(
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique,
  product_id uuid references public.products(id) on delete set null,
  internal_sku text,
  product_name text,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.tkn_external_product_identifiers(
  id uuid primary key default gen_random_uuid(),
  source text not null,
  identifier_type text not null default 'SKU',
  external_id text not null,
  product_id uuid references public.products(id) on delete set null,
  internal_sku text,
  product_name text,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source,identifier_type,external_id)
);
create index if not exists idx_tkn_ext_identifier_product on public.tkn_external_product_identifiers(product_id);
create index if not exists idx_tkn_ext_identifier_sku on public.tkn_external_product_identifiers(internal_sku);

create table if not exists public.tkn_universal_stock_commit_ledger(
  id uuid primary key default gen_random_uuid(),
  batch_item_id uuid not null unique references public.tkn_marketplace_import_batch_items(id) on delete restrict,
  batch_id uuid not null references public.tkn_marketplace_import_batches(id) on delete restrict,
  idempotency_key text not null,
  committed_quantity numeric not null check(committed_quantity>0),
  internal_sku text not null,
  product_id uuid references public.products(id) on delete set null,
  stock_document_no text,
  stock_result jsonb not null default '{}'::jsonb,
  committed_by uuid default auth.uid(),
  committed_at timestamptz not null default now()
);
create unique index if not exists uq_tkn_v5281_commit_key_item on public.tkn_universal_stock_commit_ledger(idempotency_key,batch_item_id);

create table if not exists public.tkn_universal_import_templates(
  id uuid primary key default gen_random_uuid(), template_code text not null unique, display_name text not null,
  source_hint text, mapping jsonb not null default '{}'::jsonb, is_active boolean not null default true,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ถ้า v5.28.0 เคยถูกทดลอง ให้ย้าย mapping ที่ปลอดภัยเข้าตารางใหม่โดยไม่ลบของเดิม
DO $$ begin
  if to_regclass('public.tkn_universal_barcode_mapping') is not null then
    insert into public.tkn_product_barcode_master(barcode,product_id,internal_sku,product_name,is_active,created_by,created_at,updated_at)
    select barcode,product_id,internal_sku,product_name,is_active,created_by,created_at,updated_at from public.tkn_universal_barcode_mapping
    where nullif(btrim(barcode),'') is not null
    on conflict(barcode) do nothing;
    insert into public.tkn_external_product_identifiers(source,identifier_type,external_id,product_id,internal_sku,product_name,is_active,created_by,created_at,updated_at)
    select coalesce(nullif(upper(first_source),''),'LEGACY'),'SKU',source_sku,product_id,internal_sku,product_name,is_active,created_by,created_at,updated_at
    from public.tkn_universal_barcode_mapping where nullif(btrim(source_sku),'') is not null
    on conflict(source,identifier_type,external_id) do nothing;
  end if;
end $$;

alter table public.tkn_product_barcode_master enable row level security;
alter table public.tkn_external_product_identifiers enable row level security;
alter table public.tkn_universal_stock_commit_ledger enable row level security;
alter table public.tkn_universal_import_templates enable row level security;
revoke all on public.tkn_product_barcode_master,public.tkn_external_product_identifiers,public.tkn_universal_stock_commit_ledger,public.tkn_universal_import_templates,public.tkn_v5281_install_audit from public,anon,authenticated;
grant select on public.tkn_product_barcode_master,public.tkn_external_product_identifiers,public.tkn_universal_stock_commit_ledger,public.tkn_universal_import_templates,public.tkn_v5281_install_audit to authenticated;
drop policy if exists tkn_v5281_barcode_read on public.tkn_product_barcode_master;
drop policy if exists tkn_v5281_external_read on public.tkn_external_product_identifiers;
drop policy if exists tkn_v5281_commit_read on public.tkn_universal_stock_commit_ledger;
drop policy if exists tkn_v5281_template_read on public.tkn_universal_import_templates;
create policy tkn_v5281_barcode_read on public.tkn_product_barcode_master for select to authenticated using(public.tkn_v5261_has_permission('product.manage'));
create policy tkn_v5281_external_read on public.tkn_external_product_identifiers for select to authenticated using(public.tkn_v5261_has_permission('product.manage'));
create policy tkn_v5281_commit_read on public.tkn_universal_stock_commit_ledger for select to authenticated using(public.tkn_v5261_has_permission('product.manage'));
create policy tkn_v5281_template_read on public.tkn_universal_import_templates for select to authenticated using(public.tkn_v5261_has_permission('product.manage'));

create or replace function public.tkn_v5281_begin_universal_batch(p_source text,p_template text,p_batch_name text,p_branch_code text,p_source_fingerprint text,p_source_filename text)
returns jsonb language plpgsql volatile security definer set search_path=''
as $f$
declare v_source text:=upper(regexp_replace(btrim(coalesce(p_source,'UNIVERSAL')),'[^A-Z0-9_-]','','g'));v_id uuid;v_code text;v_lines integer;v_owner uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then raise exception 'PERMISSION_DENIED: product.manage'; end if;
  if length(v_source)<2 then v_source:='UNIVERSAL'; end if;
  if not exists(select 1 from public.branches where code=p_branch_code and is_active=true) then raise exception 'INVALID_BRANCH'; end if;
  if nullif(btrim(coalesce(p_source_fingerprint,'')),'') is not null then
    select id,batch_code,expected_lines,created_by into v_id,v_code,v_lines,v_owner from public.tkn_marketplace_import_batches
    where source=v_source and source_fingerprint=p_source_fingerprint and status<>'CANCELLED' order by created_at desc limit 1;
    if found then
      if coalesce(v_lines,0)=0 and v_owner=auth.uid() then return jsonb_build_object('batch_id',v_id,'batch_code',v_code,'existing',true,'resumed',true); end if;
      return jsonb_build_object('batch_id',v_id,'batch_code',v_code,'existing',true,'resumed',false);
    end if;
  end if;
  v_code:='IMP-'||to_char(clock_timestamp(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  insert into public.tkn_marketplace_import_batches(batch_code,source,batch_name,branch_code,source_fingerprint,status,source_template,source_filename)
  values(v_code,v_source,coalesce(nullif(btrim(p_batch_name),''),coalesce(p_source_filename,'Universal Import')),p_branch_code,nullif(btrim(p_source_fingerprint),''),'WAITING_REVIEW',nullif(btrim(p_template),''),nullif(btrim(p_source_filename),'')) returning id into v_id;
  insert into public.tkn_marketplace_import_events(batch_id,event_type,to_status,note) values(v_id,'UNIVERSAL_BATCH_CREATED','WAITING_REVIEW',coalesce(p_source_filename,p_template));
  return jsonb_build_object('batch_id',v_id,'batch_code',v_code,'existing',false,'resumed',false);
end $f$;

create or replace function public.tkn_v5281_append_universal_items(p_batch_id uuid,p_items jsonb)
returns jsonb language plpgsql volatile security definer set search_path=''
as $f$
declare v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then raise exception 'PERMISSION_DENIED: product.manage'; end if;
  if jsonb_typeof(p_items)<>'array' then raise exception 'INVALID_ITEMS'; end if;
  if not exists(select 1 from public.tkn_marketplace_import_batches where id=p_batch_id) then raise exception 'BATCH_NOT_FOUND'; end if;
  insert into public.tkn_marketplace_import_batch_items(batch_id,source_line_key,line_no,source_sheet,source_batch,tracking_number,order_number,source_sku,barcode,product_name,expected_quantity,source_unit_cost,source_total_cost,unit_cost,selling_price,source_box,source_category,source_subcategory,source_status,source_shop,source_business,category_th,subcategory_th,category_status,category_reason,validation_flags,item_status,raw_data)
  select p_batch_id,nullif(btrim(x->>'source_line_key'),''),nullif(x->>'line_no','')::integer,nullif(btrim(x->>'source_sheet'),''),nullif(btrim(x->>'source_batch'),''),nullif(btrim(x->>'tracking_number'),''),nullif(btrim(x->>'order_number'),''),nullif(btrim(x->>'source_sku'),''),nullif(btrim(x->>'barcode'),''),coalesce(nullif(btrim(x->>'product_name'),''),'สินค้าไม่ระบุชื่อ'),greatest(coalesce(nullif(x->>'expected_quantity','')::numeric,1),0),nullif(x->>'source_unit_cost','')::numeric,nullif(x->>'source_total_cost','')::numeric,nullif(x->>'unit_cost','')::numeric,nullif(x->>'selling_price','')::numeric,nullif(btrim(x->>'source_box'),''),nullif(btrim(x->>'source_category'),''),nullif(btrim(x->>'source_subcategory'),''),nullif(btrim(x->>'source_status'),''),nullif(btrim(x->>'source_shop'),''),nullif(btrim(x->>'source_business'),''),coalesce(nullif(btrim(x->>'category_th'),''),'ยังไม่จัดประเภท'),coalesce(nullif(btrim(x->>'subcategory_th'),''),'รอตรวจหมวดหมู่'),case when x->>'category_status' in('AUTO','APPROVED','REVIEW') then x->>'category_status' else 'REVIEW' end,null,coalesce(x->'validation_flags','[]'::jsonb),
  case
    when coalesce(x->'validation_flags','[]'::jsonb) ?| array['COST_MISMATCH','COST_AMBIGUOUS','FORMULA_ERROR','NO_NAME','INVALID_QTY'] then 'PROBLEM'
    when coalesce(nullif(x->>'unit_cost','')::numeric,0)<=0 then 'WAITING_COST'
    when coalesce(nullif(x->>'selling_price','')::numeric,0)<=0 then 'WAITING_PRICE'
    when coalesce(x->>'category_status','REVIEW')='REVIEW' then 'WAITING_CATEGORY'
    else 'WAITING_SCAN' end,coalesce(x->'raw_data','{}'::jsonb)
  from jsonb_array_elements(p_items)x
  on conflict(batch_id,source_line_key) where source_line_key is not null do update set line_no=excluded.line_no,source_sheet=excluded.source_sheet,source_batch=excluded.source_batch,tracking_number=excluded.tracking_number,order_number=excluded.order_number,source_sku=excluded.source_sku,barcode=excluded.barcode,product_name=excluded.product_name,expected_quantity=excluded.expected_quantity,source_unit_cost=excluded.source_unit_cost,source_total_cost=excluded.source_total_cost,unit_cost=excluded.unit_cost,selling_price=excluded.selling_price,source_box=excluded.source_box,source_category=excluded.source_category,source_subcategory=excluded.source_subcategory,source_status=excluded.source_status,source_shop=excluded.source_shop,source_business=excluded.source_business,category_th=excluded.category_th,subcategory_th=excluded.subcategory_th,category_status=excluded.category_status,validation_flags=excluded.validation_flags,item_status=case when public.tkn_marketplace_import_batch_items.stock_committed_quantity>0 then public.tkn_marketplace_import_batch_items.item_status else excluded.item_status end,raw_data=excluded.raw_data,updated_at=now();
  get diagnostics v_count=row_count; return jsonb_build_object('accepted',v_count);
end $f$;

create or replace function public.tkn_v5281_finalize_universal_batch(p_batch_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $f$
declare v_lines integer;v_qty numeric;v_status text;v_code text;v_summary jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then raise exception 'PERMISSION_DENIED: product.manage'; end if;
  select count(*),coalesce(sum(expected_quantity),0),jsonb_build_object('waiting_cost',count(*) filter(where coalesce(unit_cost,0)<=0),'waiting_category',count(*) filter(where category_status='REVIEW'),'cost_mismatch',count(*) filter(where validation_flags ? 'COST_MISMATCH'),'formula_error',count(*) filter(where validation_flags ? 'FORMULA_ERROR'),'blocking',count(*) filter(where item_status='PROBLEM')) into v_lines,v_qty,v_summary from public.tkn_marketplace_import_batch_items where batch_id=p_batch_id;
  if v_lines=0 then raise exception 'EMPTY_BATCH'; end if;
  v_status:=case when (v_summary->>'waiting_cost')::int>0 then 'WAITING_COST' else 'WAITING_REVIEW' end;
  update public.tkn_marketplace_import_batches set expected_lines=v_lines,expected_quantity=v_qty,status=v_status,validation_summary=v_summary,updated_at=now() where id=p_batch_id returning batch_code into v_code;
  insert into public.tkn_marketplace_import_events(batch_id,event_type,to_status,quantity,note) values(p_batch_id,'UNIVERSAL_BATCH_FINALIZED',v_status,v_qty,v_summary::text);
  return jsonb_build_object('batch_id',p_batch_id,'batch_code',v_code,'items',v_lines,'expected_quantity',v_qty,'status',v_status,'validation',v_summary);
end $f$;

create or replace function public.tkn_v5281_find_receiving_source(p_lookup text)
returns jsonb language plpgsql stable security definer set search_path=''
as $f$
declare v text:=upper(regexp_replace(btrim(coalesce(p_lookup,'')),'\s+','','g'));r jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then raise exception 'PERMISSION_DENIED: product.manage'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'batch_id',b.id,'batch_code',b.batch_code,'branch_code',b.branch_code,'source',b.source,'tracking_number',i.tracking_number,'source_sku',i.source_sku,'barcode',i.barcode,'mapped_barcode',bm.barcode,'internal_sku',coalesce(i.internal_sku,bm.internal_sku,em.internal_sku),'product_id',coalesce(i.product_id,bm.product_id,em.product_id),'product_name',i.product_name,'expected_quantity',i.expected_quantity,'counted_quantity',i.counted_quantity,'stock_committed_quantity',i.stock_committed_quantity,'unit_cost',i.unit_cost,'selling_price',i.selling_price,'category_th',i.category_th,'subcategory_th',i.subcategory_th,'category_status',i.category_status,'validation_flags',i.validation_flags,'item_status',i.item_status) order by i.line_no,i.created_at),'[]'::jsonb) into r
  from public.tkn_marketplace_import_batch_items i join public.tkn_marketplace_import_batches b on b.id=i.batch_id
  left join public.tkn_product_barcode_master bm on bm.is_active and ((i.barcode is not null and bm.barcode=i.barcode))
  left join public.tkn_external_product_identifiers em on em.is_active and em.source=b.source and em.identifier_type='SKU' and em.external_id=i.source_sku
  where b.status<>'CANCELLED' and (upper(regexp_replace(coalesce(b.batch_code,''),'\s+','','g'))=v or upper(regexp_replace(coalesce(i.tracking_number,''),'\s+','','g'))=v or upper(regexp_replace(coalesce(i.source_sku,''),'\s+','','g'))=v or upper(regexp_replace(coalesce(i.barcode,''),'\s+','','g'))=v or upper(regexp_replace(coalesce(bm.barcode,''),'\s+','','g'))=v);
  return r;
end $f$;

create or replace function public.tkn_v5281_register_receiving_scan(p_batch_item_id uuid,p_barcode text,p_quantity numeric default 1)
returns jsonb language plpgsql volatile security definer set search_path=''
as $f$
declare v_item public.tkn_marketplace_import_batch_items%rowtype;v_new numeric;v_status text;v_source text;v_bm public.tkn_product_barcode_master%rowtype;v_internal text;v_product uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then raise exception 'PERMISSION_DENIED: product.manage'; end if;
  select * into v_item from public.tkn_marketplace_import_batch_items where id=p_batch_item_id for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  if v_item.stock_committed_quantity>0 then raise exception 'ITEM_ALREADY_STOCK_COMMITTED'; end if;
  select source into v_source from public.tkn_marketplace_import_batches where id=v_item.batch_id;
  if coalesce(btrim(p_barcode),'')<>'' then
    select * into v_bm from public.tkn_product_barcode_master where barcode=btrim(p_barcode) and is_active limit 1;
    if found then
      if v_item.product_id is not null and v_bm.product_id is not null and v_item.product_id<>v_bm.product_id then raise exception 'BARCODE_PRODUCT_CONFLICT'; end if;
      v_internal:=coalesce(v_bm.internal_sku,v_item.internal_sku,v_item.source_sku);v_product:=coalesce(v_bm.product_id,v_item.product_id);
    else
      v_internal:=coalesce(v_item.internal_sku,v_item.source_sku);v_product:=v_item.product_id;
      insert into public.tkn_product_barcode_master(barcode,product_id,internal_sku,product_name) values(btrim(p_barcode),v_product,v_internal,v_item.product_name);
    end if;
    if nullif(btrim(coalesce(v_item.source_sku,'')),'') is not null then
      insert into public.tkn_external_product_identifiers(source,identifier_type,external_id,product_id,internal_sku,product_name)
      values(v_source,'SKU',v_item.source_sku,v_product,v_internal,v_item.product_name)
      on conflict(source,identifier_type,external_id) do update set product_id=coalesce(public.tkn_external_product_identifiers.product_id,excluded.product_id),internal_sku=coalesce(public.tkn_external_product_identifiers.internal_sku,excluded.internal_sku),product_name=coalesce(excluded.product_name,public.tkn_external_product_identifiers.product_name),updated_at=now();
    end if;
    update public.tkn_marketplace_import_batch_items set barcode=coalesce(barcode,btrim(p_barcode)),internal_sku=coalesce(v_internal,internal_sku),product_id=coalesce(v_product,product_id) where id=p_batch_item_id;
  end if;
  v_new:=greatest(v_item.counted_quantity+greatest(coalesce(p_quantity,1),0),0);
  v_status:=case
    when v_new>v_item.expected_quantity then 'PROBLEM'
    when v_item.validation_flags ?| array['COST_MISMATCH','COST_AMBIGUOUS','FORMULA_ERROR','NO_NAME','INVALID_QTY'] then 'PROBLEM'
    when coalesce(v_item.unit_cost,0)<=0 then 'WAITING_COST'
    when coalesce(v_item.selling_price,0)<=0 then 'WAITING_PRICE'
    when v_item.category_status='REVIEW' then 'WAITING_CATEGORY'
    when v_new=v_item.expected_quantity then 'READY_TO_STORE'
    else 'SORTING' end;
  update public.tkn_marketplace_import_batch_items set counted_quantity=v_new,item_status=v_status,updated_at=now() where id=p_batch_item_id;
  update public.tkn_marketplace_import_batches set status='SORTING',updated_at=now() where id=v_item.batch_id and status not in('PARTIAL_STORED','COMPLETED','CANCELLED');
  insert into public.tkn_marketplace_import_events(batch_id,batch_item_id,event_type,to_status,quantity,note) values(v_item.batch_id,p_batch_item_id,'BARCODE_SCANNED',v_status,p_quantity,btrim(p_barcode));
  return jsonb_build_object('item_id',p_batch_item_id,'counted_quantity',v_new,'expected_quantity',v_item.expected_quantity,'status',v_status);
end $f$;

create or replace function public.tkn_v5281_resolve_receiving_exception(p_batch_item_id uuid,p_final_unit_cost numeric,p_selling_price numeric,p_product_name text,p_category_th text,p_subcategory_th text,p_counted_quantity numeric)
returns jsonb language plpgsql volatile security definer set search_path=''
as $f$
declare v_item public.tkn_marketplace_import_batch_items%rowtype;v_flags jsonb;v_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then raise exception 'PERMISSION_DENIED: product.manage'; end if;
  if coalesce(p_final_unit_cost,0)<=0 or coalesce(p_selling_price,0)<=0 then raise exception 'INVALID_COST_OR_PRICE'; end if;
  if nullif(btrim(coalesce(p_product_name,'')),'') is null or nullif(btrim(coalesce(p_category_th,'')),'') is null then raise exception 'INVALID_PRODUCT_OR_CATEGORY'; end if;
  select * into v_item from public.tkn_marketplace_import_batch_items where id=p_batch_item_id for update;if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  if v_item.stock_committed_quantity>0 then raise exception 'ITEM_ALREADY_STOCK_COMMITTED'; end if;
  if coalesce(p_counted_quantity,0)<0 then raise exception 'INVALID_COUNT'; end if;
  select coalesce(jsonb_agg(value),'[]'::jsonb) into v_flags from jsonb_array_elements_text(v_item.validation_flags) as f(value)
  where value not in('COST_MISMATCH','COST_AMBIGUOUS','FORMULA_ERROR','WAITING_COST','WAITING_CATEGORY','NO_NAME','INVALID_QTY');
  v_status:=case when p_counted_quantity>v_item.expected_quantity then 'PROBLEM' when p_counted_quantity=v_item.expected_quantity then 'READY_TO_STORE' else 'SORTING' end;
  update public.tkn_marketplace_import_batch_items set unit_cost=p_final_unit_cost,selling_price=p_selling_price,product_name=btrim(p_product_name),category_th=btrim(p_category_th),subcategory_th=coalesce(nullif(btrim(p_subcategory_th),''),'ทั่วไป'),category_status='APPROVED',validation_flags=v_flags,counted_quantity=p_counted_quantity,item_status=v_status,updated_at=now() where id=p_batch_item_id;
  insert into public.tkn_marketplace_import_events(batch_id,batch_item_id,event_type,from_status,to_status,quantity,note) values(v_item.batch_id,p_batch_item_id,'EXCEPTION_RESOLVED',v_item.item_status,v_status,p_counted_quantity,'ยืนยัน Final Cost/Price/Category และจำนวนตรวจจริง');
  return jsonb_build_object('item_id',p_batch_item_id,'status',v_status,'validation_flags',v_flags);
end $f$;

-- Atomic end-to-end stock commit: stock RPC และ allocation ledger อยู่ Transaction เดียวกัน
create or replace function public.tkn_v5281_commit_stock_row(p_stock_payload jsonb,p_allocations jsonb)
returns jsonb language plpgsql volatile security definer set search_path=''
as $f$
declare x jsonb;v_id uuid;v_qty numeric;v_item public.tkn_marketplace_import_batch_items%rowtype;v_total numeric:=0;v_existing integer:=0;v_alloc_count integer:=0;v_result jsonb;v_product uuid;v_internal text:=upper(btrim(coalesce(p_stock_payload->>'p_product_code','')));v_doc text;v_batch uuid;v_batches uuid[]:=array[]::uuid[];v_key text:=coalesce(nullif(p_stock_payload->>'p_idempotency_key',''),'v5281-'||gen_random_uuid()::text);
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then raise exception 'PERMISSION_DENIED: product.manage'; end if;
  if v_internal='' then raise exception 'INVALID_INTERNAL_SKU'; end if;
  if jsonb_typeof(p_allocations)<>'array' or jsonb_array_length(p_allocations)=0 then raise exception 'INVALID_ALLOCATIONS'; end if;
  -- Lock allocation rows และตรวจ readiness แบบ exact
  for x in select * from jsonb_array_elements(p_allocations) loop
    v_alloc_count:=v_alloc_count+1;
    begin v_id:=(x->>'item_id')::uuid;v_qty:=coalesce((x->>'quantity')::numeric,0);exception when others then raise exception 'INVALID_ALLOCATION';end;
    select * into v_item from public.tkn_marketplace_import_batch_items where id=v_id for update;if not found then raise exception 'ITEM_NOT_FOUND:%',v_id;end if;
    if exists(select 1 from public.tkn_universal_stock_commit_ledger where batch_item_id=v_id) then v_existing:=v_existing+1;continue;end if;
    if v_qty<=0 or v_qty<>v_item.expected_quantity then raise exception 'ALLOCATION_QTY_MISMATCH:%',v_id;end if;
    if v_item.item_status<>'READY_TO_STORE' or v_item.counted_quantity<>v_item.expected_quantity then raise exception 'ITEM_NOT_READY:%',v_id;end if;
    if v_item.validation_flags ?| array['COST_MISMATCH','COST_AMBIGUOUS','FORMULA_ERROR','WAITING_COST','WAITING_CATEGORY','NO_NAME','INVALID_QTY'] then raise exception 'ITEM_BLOCKED:%',v_id;end if;
    if coalesce(v_item.unit_cost,0)<=0 or coalesce(v_item.selling_price,0)<=0 or v_item.category_status='REVIEW' then raise exception 'ITEM_DATA_INCOMPLETE:%',v_id;end if;
    v_total:=v_total+v_qty;
  end loop;
  if v_existing=v_alloc_count then
    select stock_result into v_result from public.tkn_universal_stock_commit_ledger where batch_item_id=((p_allocations->0->>'item_id')::uuid);
    return jsonb_build_object('already_committed',true,'stock_result',coalesce(v_result,'{}'::jsonb));
  elsif v_existing>0 then raise exception 'PARTIAL_COMMIT_STATE'; end if;
  if v_total<>coalesce((p_stock_payload->>'p_quantity')::numeric,0) then raise exception 'STOCK_QTY_ALLOCATION_MISMATCH'; end if;

  select to_jsonb(public.manual_import_product_v5_15(
    p_product_code=>p_stock_payload->>'p_product_code',p_name=>p_stock_payload->>'p_name',p_barcode=>nullif(p_stock_payload->>'p_barcode',''),
    p_category_code=>p_stock_payload->>'p_category_code',p_unit_name=>p_stock_payload->>'p_unit_name',p_brand_code=>nullif(p_stock_payload->>'p_brand_code',''),
    p_cost_price=>coalesce((p_stock_payload->>'p_cost_price')::numeric,0),p_selling_price=>coalesce((p_stock_payload->>'p_selling_price')::numeric,0),
    p_vat_rate=>coalesce((p_stock_payload->>'p_vat_rate')::numeric,0),p_cost_includes_vat=>coalesce((p_stock_payload->>'p_cost_includes_vat')::boolean,false),
    p_markup_percent=>coalesce((p_stock_payload->>'p_markup_percent')::numeric,0),p_raw_selling_price=>nullif(p_stock_payload->>'p_raw_selling_price','')::numeric,
    p_round_to_ending_zero=>coalesce((p_stock_payload->>'p_round_to_ending_zero')::boolean,false),p_branch_code=>p_stock_payload->>'p_branch_code',p_quantity=>v_total,
    p_supplier_name=>nullif(p_stock_payload->>'p_supplier_name',''),p_reference_no=>nullif(p_stock_payload->>'p_reference_no',''),p_condition_status=>coalesce(nullif(p_stock_payload->>'p_condition_status',''),'NORMAL'),
    p_notes=>nullif(p_stock_payload->>'p_notes',''),p_update_selling_price=>coalesce((p_stock_payload->>'p_update_selling_price')::boolean,false),p_idempotency_key=>v_key
  )) into v_result;
  select id into v_product from public.products where upper(product_code)=v_internal limit 1;
  v_doc:=coalesce(v_result->>'stock_document_no',v_result->>'document_no');

  for x in select * from jsonb_array_elements(p_allocations) loop
    v_id:=(x->>'item_id')::uuid;v_qty:=(x->>'quantity')::numeric;
    select batch_id into v_batch from public.tkn_marketplace_import_batch_items where id=v_id;
    insert into public.tkn_universal_stock_commit_ledger(batch_item_id,batch_id,idempotency_key,committed_quantity,internal_sku,product_id,stock_document_no,stock_result) values(v_id,v_batch,v_key,v_qty,v_internal,v_product,v_doc,coalesce(v_result,'{}'::jsonb));
    update public.tkn_marketplace_import_batch_items set stock_committed_quantity=expected_quantity,stored_quantity=greatest(stored_quantity,expected_quantity),internal_sku=v_internal,product_id=coalesce(v_product,product_id),item_status='COMPLETED',updated_at=now() where id=v_id;
    insert into public.tkn_marketplace_import_events(batch_id,batch_item_id,event_type,to_status,quantity,note) values(v_batch,v_id,'STOCK_COMMITTED_ATOMIC','COMPLETED',v_qty,v_doc);
    if array_position(v_batches,v_batch) is null then v_batches:=array_append(v_batches,v_batch);end if;
  end loop;
  if nullif(p_stock_payload->>'p_barcode','') is not null then
    insert into public.tkn_product_barcode_master(barcode,product_id,internal_sku,product_name) values(p_stock_payload->>'p_barcode',v_product,v_internal,p_stock_payload->>'p_name')
    on conflict(barcode) do update set product_id=coalesce(public.tkn_product_barcode_master.product_id,excluded.product_id),internal_sku=coalesce(public.tkn_product_barcode_master.internal_sku,excluded.internal_sku),product_name=coalesce(excluded.product_name,public.tkn_product_barcode_master.product_name),updated_at=now();
  end if;
  foreach v_batch in array v_batches loop
    update public.tkn_marketplace_import_batches set status=case when not exists(select 1 from public.tkn_marketplace_import_batch_items where batch_id=v_batch and item_status<>'COMPLETED') then 'COMPLETED' else 'PARTIAL_STORED' end,updated_at=now() where id=v_batch;
  end loop;
  return jsonb_build_object('already_committed',false,'stock_result',coalesce(v_result,'{}'::jsonb),'product_id',v_product,'stock_document_no',v_doc);
end $f$;

revoke all on function public.tkn_v5281_begin_universal_batch(text,text,text,text,text,text) from public,anon;
revoke all on function public.tkn_v5281_append_universal_items(uuid,jsonb) from public,anon;
revoke all on function public.tkn_v5281_finalize_universal_batch(uuid) from public,anon;
revoke all on function public.tkn_v5281_find_receiving_source(text) from public,anon;
revoke all on function public.tkn_v5281_register_receiving_scan(uuid,text,numeric) from public,anon;
revoke all on function public.tkn_v5281_resolve_receiving_exception(uuid,numeric,numeric,text,text,text,numeric) from public,anon;
revoke all on function public.tkn_v5281_commit_stock_row(jsonb,jsonb) from public,anon;
grant execute on function public.tkn_v5281_begin_universal_batch(text,text,text,text,text,text) to authenticated;
grant execute on function public.tkn_v5281_append_universal_items(uuid,jsonb) to authenticated;
grant execute on function public.tkn_v5281_finalize_universal_batch(uuid) to authenticated;
grant execute on function public.tkn_v5281_find_receiving_source(text) to authenticated;
grant execute on function public.tkn_v5281_register_receiving_scan(uuid,text,numeric) to authenticated;
grant execute on function public.tkn_v5281_resolve_receiving_exception(uuid,numeric,numeric,text,text,text,numeric) to authenticated;
grant execute on function public.tkn_v5281_commit_stock_row(jsonb,jsonb) to authenticated;

commit;
