begin;

-- หยุดทันทีหากฐานระบบเดิมไม่ครบ
DO $preflight$
begin
  if to_regprocedure('public.tkn_v5261_has_permission(text)') is null then
    raise exception 'STOP: กรุณาติดตั้ง TKN v5.26.1 DB-SAFE ก่อน';
  end if;
  if to_regclass('public.products') is null
     or to_regclass('public.branches') is null
     or to_regclass('public.sorting_lots') is null
     or to_regclass('public.sorting_lot_items') is null
     or to_regclass('public.stock_boxes') is null
     or to_regclass('public.stock_box_items') is null then
    raise exception 'STOP: โครงสร้างฐานข้อมูลหลักไม่ครบ';
  end if;
  if not exists(select 1 from public.app_permissions where code='product.manage') then
    raise exception 'STOP: ไม่พบสิทธิ์ product.manage';
  end if;
end
$preflight$;

-- ตารางใหม่เท่านั้น ไม่แก้ตารางสต็อก/สินค้า/ขายเดิม
create table if not exists public.tkn_marketplace_import_batches (
  id uuid primary key default gen_random_uuid(),
  batch_code text not null unique,
  source text not null check (source in ('SHOPEE','LAZADA','MANUAL')),
  batch_name text not null,
  branch_code text,
  source_fingerprint text,
  status text not null default 'WAITING_REVIEW' check (status in ('WAITING_REVIEW','WAITING_COST','SORTING','PARTIAL_STORED','COMPLETED','CANCELLED')),
  expected_lines integer not null default 0,
  expected_quantity numeric not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tkn_marketplace_import_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.tkn_marketplace_import_batches(id) on delete cascade,
  source_line_key text,
  line_no integer,
  tracking_number text,
  order_number text,
  source_sku text,
  barcode text,
  internal_sku text,
  product_id uuid references public.products(id),
  product_name text not null,
  expected_quantity numeric not null default 1,
  counted_quantity numeric not null default 0,
  stored_quantity numeric not null default 0,
  unit_cost numeric,
  selling_price numeric,
  category_th text not null default 'ยังไม่จัดประเภท',
  subcategory_th text not null default 'รอตรวจหมวดหมู่',
  category_reason text,
  category_status text not null default 'REVIEW' check (category_status in ('AUTO','APPROVED','REVIEW')),
  item_status text not null default 'WAITING_SCAN' check (item_status in ('WAITING_SCAN','SORTING','WAITING_COST','WAITING_PRICE','WAITING_CATEGORY','READY_TO_STORE','IN_BOX','IN_WAREHOUSE','PROBLEM','COMPLETED')),
  last_box_code text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tkn_marketplace_category_mapping (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_main_category text not null default '',
  source_sub_category text not null default '',
  keyword text not null default '',
  category_th text not null,
  subcategory_th text not null,
  is_active boolean not null default true,
  approved_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique(source, source_main_category, source_sub_category, keyword)
);

create table if not exists public.tkn_marketplace_import_events (
  id bigserial primary key,
  batch_id uuid references public.tkn_marketplace_import_batches(id) on delete cascade,
  batch_item_id uuid references public.tkn_marketplace_import_batch_items(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  quantity numeric,
  box_id uuid,
  box_code text,
  note text,
  actor_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- รองรับกรณีเคยสร้างตารางจาก v5.27.0 โดยเพิ่มเฉพาะคอลัมน์ใหม่และรักษาข้อมูลเดิม
alter table public.tkn_marketplace_import_batches add column if not exists source_fingerprint text;
alter table public.tkn_marketplace_import_batch_items add column if not exists source_line_key text;
alter table public.tkn_marketplace_import_batch_items add column if not exists barcode text;
alter table public.tkn_marketplace_import_batch_items add column if not exists category_reason text;
alter table public.tkn_marketplace_import_batch_items add column if not exists last_box_code text;
alter table public.tkn_marketplace_import_events add column if not exists box_code text;

create unique index if not exists uq_tkn_mp_source_fingerprint
  on public.tkn_marketplace_import_batches(source,source_fingerprint)
  where source_fingerprint is not null;
create unique index if not exists uq_tkn_mp_batch_line_key
  on public.tkn_marketplace_import_batch_items(batch_id,source_line_key)
  where source_line_key is not null;
create index if not exists idx_tkn_mp_items_batch on public.tkn_marketplace_import_batch_items(batch_id);
create index if not exists idx_tkn_mp_items_tracking on public.tkn_marketplace_import_batch_items(tracking_number);
create index if not exists idx_tkn_mp_items_order on public.tkn_marketplace_import_batch_items(order_number);
create index if not exists idx_tkn_mp_items_source_sku on public.tkn_marketplace_import_batch_items(source_sku);

alter table public.tkn_marketplace_import_batches enable row level security;
alter table public.tkn_marketplace_import_batch_items enable row level security;
alter table public.tkn_marketplace_category_mapping enable row level security;
alter table public.tkn_marketplace_import_events enable row level security;

-- ลบเฉพาะ Policy กว้างของตารางใหม่จาก v5.27.0 ไม่แตะ Policy ตารางหลัก
DROP POLICY IF EXISTS "tkn_mp_batches_authenticated" ON public.tkn_marketplace_import_batches;
DROP POLICY IF EXISTS "tkn_mp_items_authenticated" ON public.tkn_marketplace_import_batch_items;
DROP POLICY IF EXISTS "tkn_mp_category_authenticated" ON public.tkn_marketplace_category_mapping;
DROP POLICY IF EXISTS "tkn_mp_events_authenticated" ON public.tkn_marketplace_import_events;
DROP POLICY IF EXISTS tkn_v5271_batches_read ON public.tkn_marketplace_import_batches;
DROP POLICY IF EXISTS tkn_v5271_items_read ON public.tkn_marketplace_import_batch_items;
DROP POLICY IF EXISTS tkn_v5271_category_read ON public.tkn_marketplace_category_mapping;
DROP POLICY IF EXISTS tkn_v5271_events_read ON public.tkn_marketplace_import_events;

create policy tkn_v5271_batches_read on public.tkn_marketplace_import_batches
  for select to authenticated using (public.tkn_v5261_has_permission('product.manage'));
create policy tkn_v5271_items_read on public.tkn_marketplace_import_batch_items
  for select to authenticated using (public.tkn_v5261_has_permission('product.manage'));
create policy tkn_v5271_category_read on public.tkn_marketplace_category_mapping
  for select to authenticated using (public.tkn_v5261_has_permission('product.manage'));
create policy tkn_v5271_events_read on public.tkn_marketplace_import_events
  for select to authenticated using (public.tkn_v5261_has_permission('product.manage'));

revoke all on public.tkn_marketplace_import_batches,public.tkn_marketplace_import_batch_items,
  public.tkn_marketplace_category_mapping,public.tkn_marketplace_import_events from public,anon,authenticated;
grant select on public.tkn_marketplace_import_batches,public.tkn_marketplace_import_batch_items,
  public.tkn_marketplace_category_mapping,public.tkn_marketplace_import_events to authenticated;

create or replace function public.tkn_v5271_begin_import_batch(
  p_source text,
  p_batch_name text,
  p_branch_code text,
  p_source_fingerprint text
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $function$
declare
  v_source text:=upper(btrim(coalesce(p_source,'')));
  v_branch text:=btrim(coalesce(p_branch_code,''));
  v_batch_id uuid;
  v_batch_code text;
  v_existing_lines integer;
  v_existing_created_by uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then raise exception 'PERMISSION_DENIED: product.manage'; end if;
  if v_source not in ('SHOPEE','LAZADA','MANUAL') then raise exception 'INVALID_SOURCE'; end if;
  if v_branch='' or not exists(select 1 from public.branches where code=v_branch and is_active=true) then raise exception 'INVALID_BRANCH'; end if;
  if nullif(btrim(coalesce(p_source_fingerprint,'')),'') is not null then
    select id,batch_code,expected_lines,created_by into v_batch_id,v_batch_code,v_existing_lines,v_existing_created_by
    from public.tkn_marketplace_import_batches
    where source=v_source and source_fingerprint=p_source_fingerprint and status<>'CANCELLED'
    order by created_at desc limit 1;
    if found then
      if coalesce(v_existing_lines,0)=0 and v_existing_created_by=auth.uid() then
        return jsonb_build_object('batch_id',v_batch_id,'batch_code',v_batch_code,'resumed',true);
      end if;
      raise exception 'DUPLICATE_IMPORT_BATCH';
    end if;
  end if;
  v_batch_code := 'IMP-' || to_char(clock_timestamp(),'YYYYMMDD-HH24MISS') || '-' || upper(substr(gen_random_uuid()::text,1,4));
  insert into public.tkn_marketplace_import_batches(batch_code,source,batch_name,branch_code,source_fingerprint,status)
  values(v_batch_code,v_source,coalesce(nullif(btrim(p_batch_name),''),v_batch_code),v_branch,nullif(btrim(p_source_fingerprint),''),'WAITING_REVIEW')
  returning id into v_batch_id;
  insert into public.tkn_marketplace_import_events(batch_id,event_type,to_status,note)
  values(v_batch_id,'BATCH_STARTED','WAITING_REVIEW','เริ่มสร้างชุดงานจากหน้า Marketplace');
  return jsonb_build_object('batch_id',v_batch_id,'batch_code',v_batch_code);
end
$function$;

create or replace function public.tkn_v5271_append_import_items(p_batch_id uuid,p_items jsonb)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $function$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then raise exception 'PERMISSION_DENIED: product.manage'; end if;
  if not exists(select 1 from public.tkn_marketplace_import_batches where id=p_batch_id and status<>'CANCELLED') then raise exception 'BATCH_NOT_FOUND'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'EMPTY_ITEMS'; end if;

  insert into public.tkn_marketplace_import_batch_items(
    batch_id,source_line_key,line_no,tracking_number,order_number,source_sku,barcode,product_name,
    expected_quantity,unit_cost,selling_price,category_th,subcategory_th,category_reason,category_status,item_status,raw_data
  )
  select p_batch_id,
    nullif(btrim(x->>'source_line_key'),''),nullif(x->>'line_no','')::integer,
    nullif(btrim(x->>'tracking_number'),''),nullif(btrim(x->>'order_number'),''),nullif(btrim(x->>'source_sku'),''),nullif(btrim(x->>'barcode'),''),
    coalesce(nullif(btrim(x->>'product_name'),''),'สินค้าไม่ระบุชื่อ'),greatest(coalesce(nullif(x->>'expected_quantity','')::numeric,1),0),
    nullif(x->>'unit_cost','')::numeric,nullif(x->>'selling_price','')::numeric,
    coalesce(nullif(btrim(x->>'category_th'),''),'ยังไม่จัดประเภท'),coalesce(nullif(btrim(x->>'subcategory_th'),''),'รอตรวจหมวดหมู่'),
    nullif(btrim(x->>'category_reason'),''),
    case when x->>'category_status' in ('AUTO','APPROVED','REVIEW') then x->>'category_status' else 'REVIEW' end,
    case when coalesce(nullif(x->>'unit_cost','')::numeric,0)<=0 then 'WAITING_COST'
         when coalesce(nullif(x->>'selling_price','')::numeric,0)<=0 then 'WAITING_PRICE'
         when coalesce(x->>'category_status','REVIEW')='REVIEW' then 'WAITING_CATEGORY'
         else 'WAITING_SCAN' end,
    coalesce(x->'raw_data','{}'::jsonb)
  from jsonb_array_elements(p_items) x
  on conflict(batch_id,source_line_key) where source_line_key is not null do update set
    line_no=excluded.line_no,tracking_number=excluded.tracking_number,order_number=excluded.order_number,
    source_sku=excluded.source_sku,barcode=excluded.barcode,product_name=excluded.product_name,
    expected_quantity=excluded.expected_quantity,unit_cost=excluded.unit_cost,selling_price=excluded.selling_price,
    category_th=excluded.category_th,subcategory_th=excluded.subcategory_th,category_reason=excluded.category_reason,
    category_status=excluded.category_status,item_status=excluded.item_status,raw_data=excluded.raw_data,updated_at=now();
  get diagnostics v_count=row_count;
  return jsonb_build_object('accepted',v_count);
end
$function$;

create or replace function public.tkn_v5271_finalize_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $function$
declare v_lines integer; v_qty numeric; v_status text; v_code text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then raise exception 'PERMISSION_DENIED: product.manage'; end if;
  select count(*),coalesce(sum(expected_quantity),0) into v_lines,v_qty from public.tkn_marketplace_import_batch_items where batch_id=p_batch_id;
  if v_lines=0 then raise exception 'EMPTY_BATCH'; end if;
  select case
    when exists(select 1 from public.tkn_marketplace_import_batch_items where batch_id=p_batch_id and coalesce(unit_cost,0)<=0) then 'WAITING_COST'
    else 'WAITING_REVIEW' end into v_status;
  update public.tkn_marketplace_import_batches
  set expected_lines=v_lines,expected_quantity=v_qty,status=v_status,updated_at=now()
  where id=p_batch_id returning batch_code into v_code;
  if v_code is null then raise exception 'BATCH_NOT_FOUND'; end if;
  insert into public.tkn_marketplace_import_events(batch_id,event_type,to_status,quantity,note)
  values(p_batch_id,'BATCH_FINALIZED',v_status,v_qty,'บันทึกรายการนำเข้าครบแล้ว');
  return jsonb_build_object('batch_id',p_batch_id,'batch_code',v_code,'items',v_lines,'expected_quantity',v_qty,'status',v_status);
end
$function$;

create or replace function public.tkn_v5271_find_sorting_source(p_lookup text,p_source text default null)
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare v_lookup text:=upper(regexp_replace(btrim(coalesce(p_lookup,'')),'\s+','','g')); v_source text:=upper(nullif(btrim(coalesce(p_source,'')),'')); v_result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then raise exception 'PERMISSION_DENIED: product.manage'; end if;
  if v_lookup='' then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'batch_id',b.id,'batch_code',b.batch_code,'source',b.source,
    'tracking_number',i.tracking_number,'order_number',i.order_number,'source_sku',i.source_sku,
    'sku',coalesce(i.internal_sku,i.source_sku),'barcode',i.barcode,'product_id',i.product_id,
    'product_name',i.product_name,'expected_quantity',i.expected_quantity,'quantity',i.expected_quantity,
    'unit_cost',i.unit_cost,'selling_price',i.selling_price,'category_th',i.category_th,
    'subcategory_th',i.subcategory_th,'main_category',i.category_th,'sub_category',i.subcategory_th,
    'category_status',i.category_status,'raw_data',i.raw_data
  ) order by b.created_at desc,i.line_no,i.created_at),'[]'::jsonb) into v_result
  from public.tkn_marketplace_import_batch_items i
  join public.tkn_marketplace_import_batches b on b.id=i.batch_id
  where b.status<>'CANCELLED'
    and (v_source is null or b.source=v_source)
    and (
      upper(regexp_replace(coalesce(b.batch_code,''),'\s+','','g'))=v_lookup
      or upper(regexp_replace(coalesce(i.tracking_number,''),'\s+','','g'))=v_lookup
      or upper(regexp_replace(coalesce(i.order_number,''),'\s+','','g'))=v_lookup
      or upper(regexp_replace(coalesce(i.source_sku,''),'\s+','','g'))=v_lookup
      or upper(regexp_replace(coalesce(i.internal_sku,''),'\s+','','g'))=v_lookup
      or upper(regexp_replace(coalesce(i.barcode,''),'\s+','','g'))=v_lookup
    );
  return v_result;
end
$function$;

create or replace function public.tkn_v5271_sync_sorting_progress(p_items jsonb,p_mark_stored boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $function$
declare x jsonb; v_id uuid; v_batch uuid; v_batches uuid[]:=array[]::uuid[]; v_updated integer:=0; v_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then raise exception 'PERMISSION_DENIED: product.manage'; end if;
  if jsonb_typeof(p_items)<>'array' then raise exception 'INVALID_ITEMS'; end if;
  for x in select * from jsonb_array_elements(p_items) loop
    begin v_id:=(x->>'batch_item_id')::uuid; exception when others then continue; end;
    select batch_id into v_batch from public.tkn_marketplace_import_batch_items where id=v_id for update;
    if not found then continue; end if;
    update public.tkn_marketplace_import_batch_items set
      counted_quantity=greatest(coalesce(nullif(x->>'counted_quantity','')::numeric,0),0),
      stored_quantity=case when p_mark_stored then greatest(stored_quantity,coalesce(nullif(x->>'stored_quantity','')::numeric,0)) else stored_quantity end,
      internal_sku=coalesce(nullif(btrim(x->>'internal_sku'),''),internal_sku),
      product_id=coalesce(nullif(x->>'product_id','')::uuid,product_id),
      unit_cost=coalesce(nullif(x->>'unit_cost','')::numeric,unit_cost),
      selling_price=coalesce(nullif(x->>'selling_price','')::numeric,selling_price),
      category_th=coalesce(nullif(btrim(x->>'category_th'),''),category_th),
      subcategory_th=coalesce(nullif(btrim(x->>'subcategory_th'),''),subcategory_th),
      last_box_code=case when p_mark_stored then coalesce(nullif(btrim(x->>'box_code'),''),last_box_code) else last_box_code end,
      item_status=case
        when p_mark_stored and greatest(stored_quantity,coalesce(nullif(x->>'stored_quantity','')::numeric,0))>=expected_quantity then 'COMPLETED'
        when p_mark_stored then 'IN_BOX'
        when coalesce(nullif(x->>'unit_cost','')::numeric,unit_cost,0)<=0 then 'WAITING_COST'
        when coalesce(nullif(x->>'selling_price','')::numeric,selling_price,0)<=0 then 'WAITING_PRICE'
        else 'SORTING' end,
      updated_at=now()
    where id=v_id;
    v_updated:=v_updated+1;
    if array_position(v_batches,v_batch) is null then v_batches:=array_append(v_batches,v_batch); end if;
  end loop;

  foreach v_batch in array v_batches loop
    select case
      when not exists(select 1 from public.tkn_marketplace_import_batch_items where batch_id=v_batch and item_status<>'COMPLETED') then 'COMPLETED'
      when exists(select 1 from public.tkn_marketplace_import_batch_items where batch_id=v_batch and stored_quantity>0) then 'PARTIAL_STORED'
      when exists(select 1 from public.tkn_marketplace_import_batch_items where batch_id=v_batch and counted_quantity>0) then 'SORTING'
      when exists(select 1 from public.tkn_marketplace_import_batch_items where batch_id=v_batch and coalesce(unit_cost,0)<=0) then 'WAITING_COST'
      else 'WAITING_REVIEW' end into v_status;
    update public.tkn_marketplace_import_batches set status=v_status,updated_at=now() where id=v_batch;
    insert into public.tkn_marketplace_import_events(batch_id,event_type,to_status,note)
    values(v_batch,case when p_mark_stored then 'STOCK_STORED' else 'SORTING_SYNC' end,v_status,'ซิงก์จากหน้าแยกสินค้า');
  end loop;
  return jsonb_build_object('updated',v_updated,'batches',coalesce(array_length(v_batches,1),0));
end
$function$;

revoke all on function public.tkn_v5271_begin_import_batch(text,text,text,text) from public,anon;
revoke all on function public.tkn_v5271_append_import_items(uuid,jsonb) from public,anon;
revoke all on function public.tkn_v5271_finalize_import_batch(uuid) from public,anon;
revoke all on function public.tkn_v5271_find_sorting_source(text,text) from public,anon;
revoke all on function public.tkn_v5271_sync_sorting_progress(jsonb,boolean) from public,anon;
grant execute on function public.tkn_v5271_begin_import_batch(text,text,text,text) to authenticated;
grant execute on function public.tkn_v5271_append_import_items(uuid,jsonb) to authenticated;
grant execute on function public.tkn_v5271_finalize_import_batch(uuid) to authenticated;
grant execute on function public.tkn_v5271_find_sorting_source(text,text) to authenticated;
grant execute on function public.tkn_v5271_sync_sorting_progress(jsonb,boolean) to authenticated;

commit;
