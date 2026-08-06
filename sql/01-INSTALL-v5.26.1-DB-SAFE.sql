-- ============================================================
-- TKN POS / ERP v5.26.1 DB-SAFE
-- Whole-box issue, branch transfer/receive, mobile box sale
--
-- DB-SAFE RULES
-- - ไม่ UPDATE/DELETE ข้อมูลเดิมในขั้นตอนติดตั้ง
-- - ไม่ ALTER ตารางหลัก: stock_boxes, stock_box_items, sales, sale_items,
--   branch_inventory, transfer_documents, transfer_items
-- - ไม่ติด Trigger บนตารางหลัก
-- - ไม่ DROP Constraint / Policy / Function ของระบบเดิม
-- - เพิ่มเฉพาะ Permission, ตาราง/วิว/ฟังก์ชันชื่อใหม่ v5261
-- - การลบรายการในกล่องและตัดสต็อกเกิดเฉพาะเมื่อผู้ใช้กดยืนยันรายการจริง
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0) Hard preflight — ล้มทั้ง transaction หากฐานไม่ครบหรือพบ Trigger รุ่นเสี่ยง
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.stock_boxes') is null
     or to_regclass('public.stock_box_items') is null then
    raise exception 'ไม่พบระบบ Box QR เดิม';
  end if;
  if to_regclass('public.branches') is null
     or to_regclass('public.branch_inventory') is null then
    raise exception 'ไม่พบระบบสต็อกแยกสาขา';
  end if;
  if to_regclass('public.transfer_documents') is null
     or to_regclass('public.transfer_items') is null then
    raise exception 'ไม่พบระบบโอนสินค้า';
  end if;
  if to_regclass('public.sales') is null
     or to_regclass('public.sale_items') is null then
    raise exception 'ไม่พบระบบ POS';
  end if;
  if to_regclass('public.products') is null then
    raise exception 'ไม่พบฐานสินค้า';
  end if;
  if to_regclass('public.app_roles') is null
     or to_regclass('public.app_permissions') is null
     or to_regclass('public.app_role_permissions') is null then
    raise exception 'ไม่พบระบบสิทธิ์ Master 3.3 LTS';
  end if;
  if to_regprocedure('public.current_access_context()') is null
     or to_regprocedure('public.create_branch_transfer(uuid,uuid,jsonb,text,text)') is null
     or to_regprocedure('public.receive_branch_transfer(uuid)') is null
     or to_regprocedure('public.create_pos_sale(uuid,jsonb,numeric,text,numeric,text,text,text)') is null
     or to_regprocedure('public.is_active_user()') is null then
    raise exception 'ฟังก์ชันฐานของสิทธิ์/โอน/POS ไม่ครบ';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='stock_box_items' and column_name='product_id') then
    raise exception 'stock_box_items ยังไม่มี product_id';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='cost_price')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='selling_price') then
    raise exception 'products ยังไม่มี cost_price/selling_price';
  end if;
  if not exists(select 1 from public.branches where is_active=true) then
    raise exception 'ไม่พบสาขาที่เปิดใช้งาน';
  end if;
  if exists(
    select 1 from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname='public'
      and c.relname in ('stock_boxes','stock_box_items','sales','sale_items','transfer_documents')
      and t.tgname in (
        'trg_tkn_guard_box_header_mutation',
        'trg_tkn_guard_in_transit_box_items',
        'trg_tkn_guard_linked_box_transfer_status',
        'trg_tkn_sale_item_storefront_sync',
        'trg_tkn_void_sale_storefront_restore',
        'trg_tkn_box_item_storefront_sync'
      )
  ) then
    raise exception 'พบ Trigger จาก Patch v5.26.0 รุ่นเดิม กรุณา Rollback รุ่นเดิมก่อนติดตั้ง DB-SAFE';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1) Permission — เพิ่มอย่างเดียว ไม่แก้ชื่อ Permission เดิม
-- ------------------------------------------------------------
insert into public.app_permissions(code,module,name_th)
values
 ('pos.box_sale.create','pos','ขายสินค้าด้วย QR กล่อง'),
 ('pos.box_sale.lump_price','pos','กำหนดราคาขายเหมายกกล่อง'),
 ('pos.box_sale.below_cost','pos','อนุมัติขายยกกล่องต่ำกว่าต้นทุน'),
 ('pos.box_sale.cancel','pos','ยกเลิกร่างขายยกกล่อง'),
 ('inventory.box_transfer','inventory','โอนและรับสินค้าทั้งกล่อง')
on conflict(code) do nothing;

insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
join public.app_permissions p on p.code=any(array[
  'pos.box_sale.create','pos.box_sale.lump_price','inventory.box_transfer'
]::text[])
where r.code in ('owner','admin','manager','secretary','supervisor')
on conflict(role_id,permission_id) do nothing;

insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
join public.app_permissions p on p.code=any(array[
  'pos.box_sale.below_cost','pos.box_sale.cancel'
]::text[])
where r.code in ('owner','admin')
on conflict(role_id,permission_id) do nothing;

insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
join public.app_permissions p on p.code='pos.box_sale.cancel'
where r.code='manager'
on conflict(role_id,permission_id) do nothing;

insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
join public.app_permissions p on p.code='inventory.box_transfer'
where r.code='warehouse'
on conflict(role_id,permission_id) do nothing;

-- ------------------------------------------------------------
-- 2) Sidecar tables — ไม่เพิ่มคอลัมน์ให้ตารางเดิม
-- ------------------------------------------------------------
create table if not exists public.tkn_v5261_box_tracking (
  box_id uuid primary key references public.stock_boxes(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete set null,
  location_state text not null default 'WAREHOUSE'
    check(location_state in ('WAREHOUSE','IN_TRANSIT','EMPTY')),
  active_transfer_id uuid references public.transfer_documents(id) on delete set null,
  active_cycle_id uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.tkn_v5261_box_cycles (
  id uuid primary key default extensions.gen_random_uuid(),
  box_id uuid not null references public.stock_boxes(id) on delete restrict,
  cycle_no bigint not null,
  branch_id uuid references public.branches(id) on delete set null,
  status text not null default 'CLOSED'
    check(status in ('OPEN','CLOSED','IN_TRANSIT','ISSUED_TO_STOREFRONT','SOLD','CANCELLED')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  metadata jsonb not null default '{}'::jsonb,
  unique(box_id,cycle_no)
);

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conname='tkn_v5261_box_tracking_active_cycle_fkey'
      and conrelid='public.tkn_v5261_box_tracking'::regclass
  ) then
    alter table public.tkn_v5261_box_tracking
      add constraint tkn_v5261_box_tracking_active_cycle_fkey
      foreign key(active_cycle_id) references public.tkn_v5261_box_cycles(id) on delete set null;
  end if;
end $$;

create table if not exists public.tkn_v5261_box_cycle_items (
  id uuid primary key default extensions.gen_random_uuid(),
  cycle_id uuid not null references public.tkn_v5261_box_cycles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  sku text not null,
  product_name_snapshot text,
  lot_code_snapshot text,
  quantity numeric(14,3) not null check(quantity>0),
  unit_cost_snapshot numeric(14,2) not null default 0 check(unit_cost_snapshot>=0),
  unit_price_snapshot numeric(14,2) not null default 0 check(unit_price_snapshot>=0),
  created_at timestamptz not null default now(),
  unique(cycle_id,sku)
);

create table if not exists public.tkn_v5261_box_movements (
  id uuid primary key default extensions.gen_random_uuid(),
  box_id uuid not null references public.stock_boxes(id) on delete restrict,
  cycle_id uuid references public.tkn_v5261_box_cycles(id) on delete set null,
  action text not null,
  from_branch_id uuid references public.branches(id) on delete set null,
  to_branch_id uuid references public.branches(id) on delete set null,
  from_location text,
  to_location text,
  transfer_id uuid references public.transfer_documents(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.tkn_v5261_box_transfer_links (
  id uuid primary key default extensions.gen_random_uuid(),
  transfer_id uuid not null references public.transfer_documents(id) on delete restrict,
  box_id uuid not null references public.stock_boxes(id) on delete restrict,
  cycle_id uuid references public.tkn_v5261_box_cycles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(transfer_id,box_id)
);

create table if not exists public.tkn_v5261_box_sale_drafts (
  id uuid primary key default extensions.gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  status text not null default 'DRAFT'
    check(status in ('DRAFT','COMPLETED','CANCELLED','EXPIRED')),
  pricing_mode text check(pricing_mode is null or pricing_mode in ('SKU','LUMP')),
  lump_price numeric(14,2),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  sale_id uuid references public.sales(id) on delete set null,
  lock_expires_at timestamptz not null default (now()+interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tkn_v5261_box_sale_draft_boxes (
  draft_id uuid not null references public.tkn_v5261_box_sale_drafts(id) on delete cascade,
  box_id uuid not null references public.stock_boxes(id) on delete restrict,
  cycle_id uuid not null references public.tkn_v5261_box_cycles(id) on delete restrict,
  item_hash text not null,
  created_at timestamptz not null default now(),
  primary key(draft_id,box_id)
);

create table if not exists public.tkn_v5261_box_sale_draft_items (
  id uuid primary key default extensions.gen_random_uuid(),
  draft_id uuid not null references public.tkn_v5261_box_sale_drafts(id) on delete cascade,
  box_id uuid not null references public.stock_boxes(id) on delete restrict,
  cycle_id uuid not null references public.tkn_v5261_box_cycles(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  sku text not null,
  product_name_snapshot text,
  lot_code_snapshot text,
  quantity numeric(14,3) not null check(quantity>0),
  unit_cost_snapshot numeric(14,2) not null default 0,
  unit_price_snapshot numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(draft_id,box_id,sku)
);

create table if not exists public.tkn_v5261_box_sales (
  id uuid primary key default extensions.gen_random_uuid(),
  sale_id uuid not null unique references public.sales(id) on delete restrict,
  draft_id uuid references public.tkn_v5261_box_sale_drafts(id) on delete set null,
  branch_id uuid not null references public.branches(id) on delete restrict,
  pricing_mode text not null check(pricing_mode in ('SKU','LUMP')),
  box_count integer not null,
  sku_count integer not null,
  total_quantity numeric(14,3) not null,
  normal_price_total numeric(14,2) not null,
  cost_total numeric(14,2) not null,
  sale_total numeric(14,2) not null,
  gross_profit numeric(14,2) not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.tkn_v5261_box_sale_boxes (
  box_sale_id uuid not null references public.tkn_v5261_box_sales(id) on delete cascade,
  box_id uuid not null references public.stock_boxes(id) on delete restrict,
  cycle_id uuid not null references public.tkn_v5261_box_cycles(id) on delete restrict,
  primary key(box_sale_id,box_id)
);

create table if not exists public.tkn_v5261_box_sale_items (
  box_sale_id uuid not null references public.tkn_v5261_box_sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  sku text not null,
  quantity numeric(14,3) not null,
  unit_cost_snapshot numeric(14,2) not null default 0,
  cost_total numeric(14,2) not null default 0,
  normal_price_total numeric(14,2) not null default 0,
  allocated_sale_total numeric(14,2) not null default 0,
  primary key(box_sale_id,product_id)
);

create index if not exists idx_tkn_v5261_tracking_branch_location
  on public.tkn_v5261_box_tracking(branch_id,location_state);
create index if not exists idx_tkn_v5261_cycles_box
  on public.tkn_v5261_box_cycles(box_id,cycle_no desc);
create index if not exists idx_tkn_v5261_movements_box
  on public.tkn_v5261_box_movements(box_id,created_at desc);
create index if not exists idx_tkn_v5261_transfer_links_box
  on public.tkn_v5261_box_transfer_links(box_id,created_at desc);
create index if not exists idx_tkn_v5261_sale_drafts_user
  on public.tkn_v5261_box_sale_drafts(created_by,status,created_at desc);
create index if not exists idx_tkn_v5261_sale_draft_boxes_box
  on public.tkn_v5261_box_sale_draft_boxes(box_id);

-- ------------------------------------------------------------
-- 3) Helpers
-- ------------------------------------------------------------
create or replace function public.tkn_v5261_has_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  with c as (select public.current_access_context() ctx)
  select coalesce(ctx->>'role','') in ('owner','admin')
      or coalesce(ctx->'permissions','[]'::jsonb) ? p_code
  from c;
$$;

create or replace function public.tkn_v5261_resolve_branch(p_branch_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_exists boolean;
begin
  if p_branch_id is null then raise exception 'กรุณาเลือกสาขา'; end if;
  select exists(select 1 from public.branches where id=p_branch_id and is_active=true) into v_exists;
  if not v_exists then raise exception 'ไม่พบสาขาหรือสาขาถูกปิดใช้งาน'; end if;
  return p_branch_id;
end $$;

create or replace function public.tkn_v5261_assert_box_items(p_box_id uuid)
returns void
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not exists(select 1 from public.stock_box_items where box_id=p_box_id and quantity>0) then
    raise exception 'กล่องนี้ไม่มีสินค้า';
  end if;
  if exists(select 1 from public.stock_box_items where box_id=p_box_id and quantity>0 and product_id is null) then
    raise exception 'กล่องนี้มีสินค้าที่ยังไม่ผูกกับฐานสินค้า';
  end if;
end $$;

create or replace function public.tkn_v5261_effective_location(p_box_id uuid)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    (select case when active_transfer_id is not null then 'IN_TRANSIT' else location_state end
     from public.tkn_v5261_box_tracking where box_id=p_box_id),
    case when exists(select 1 from public.stock_box_items where box_id=p_box_id and quantity>0)
         then 'WAREHOUSE' else 'EMPTY' end
  );
$$;

create or replace function public.tkn_v5261_ensure_tracking(p_box_id uuid,p_branch_id uuid default null)
returns public.tkn_v5261_box_tracking
language plpgsql
volatile
security definer
set search_path=''
as $$
declare v_row public.tkn_v5261_box_tracking; v_state text;
begin
  v_state:=case when exists(select 1 from public.stock_box_items where box_id=p_box_id and quantity>0)
                then 'WAREHOUSE' else 'EMPTY' end;
  insert into public.tkn_v5261_box_tracking(box_id,branch_id,location_state)
  values(p_box_id,p_branch_id,v_state)
  on conflict(box_id) do update
  set branch_id=coalesce(tkn_v5261_box_tracking.branch_id,excluded.branch_id),
      updated_at=now()
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.tkn_v5261_ensure_cycle(p_box_id uuid,p_branch_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path=''
as $$
declare v_tracking public.tkn_v5261_box_tracking; v_cycle uuid; v_next bigint;
begin
  v_tracking:=public.tkn_v5261_ensure_tracking(p_box_id,p_branch_id);
  v_cycle:=v_tracking.active_cycle_id;
  if v_cycle is not null and exists(
    select 1 from public.tkn_v5261_box_cycles
    where id=v_cycle and status in ('OPEN','CLOSED','IN_TRANSIT')
  ) then return v_cycle; end if;

  select coalesce(max(cycle_no),0)+1 into v_next
  from public.tkn_v5261_box_cycles where box_id=p_box_id;

  insert into public.tkn_v5261_box_cycles(box_id,cycle_no,branch_id,status,closed_at)
  select b.id,v_next,p_branch_id,
         case when upper(coalesce(b.status::text,''))='CLOSED' then 'CLOSED' else 'OPEN' end,
         b.closed_at
  from public.stock_boxes b where b.id=p_box_id
  returning id into v_cycle;

  update public.tkn_v5261_box_tracking
  set active_cycle_id=v_cycle,branch_id=coalesce(branch_id,p_branch_id),updated_at=now()
  where box_id=p_box_id;
  return v_cycle;
end $$;

create or replace function public.tkn_v5261_sync_cycle_items(p_cycle_id uuid,p_box_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path=''
as $$
begin
  delete from public.tkn_v5261_box_cycle_items where cycle_id=p_cycle_id;
  insert into public.tkn_v5261_box_cycle_items(
    cycle_id,product_id,sku,product_name_snapshot,lot_code_snapshot,
    quantity,unit_cost_snapshot,unit_price_snapshot
  )
  select p_cycle_id,i.product_id,i.sku,p.name,p.lot_code,
         i.quantity,coalesce(p.cost_price,0),coalesce(p.selling_price,0)
  from public.stock_box_items i
  left join public.products p on p.id=i.product_id
  where i.box_id=p_box_id and i.quantity>0;
end $$;

create or replace function public.tkn_v5261_box_hash(p_box_id uuid)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select md5(coalesce(jsonb_agg(
    jsonb_build_object('sku',i.sku,'product_id',i.product_id,'quantity',i.quantity)
    order by i.sku
  )::text,'[]'))
  from public.stock_box_items i
  where i.box_id=p_box_id and i.quantity>0;
$$;

-- ------------------------------------------------------------
-- 4) Register location from Box QR / Sort & Pack
-- ------------------------------------------------------------
create or replace function public.tkn_v5261_register_box_location(
  p_box_code text,
  p_branch_id uuid,
  p_requested_state text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare v_branch uuid:=public.tkn_v5261_resolve_branch(p_branch_id); v_box public.stock_boxes%rowtype; v_tracking public.tkn_v5261_box_tracking; v_state text;
begin
  if not public.tkn_v5261_has_permission('product.manage')
     and not public.tkn_v5261_has_permission('inventory.issue')
     and not public.tkn_v5261_has_permission('inventory.box_transfer') then
    raise exception 'ไม่มีสิทธิ์จัดตำแหน่งกล่อง';
  end if;
  select * into v_box from public.stock_boxes where upper(box_code)=upper(btrim(p_box_code));
  if not found then raise exception 'ไม่พบกล่อง %',p_box_code; end if;
  v_tracking:=public.tkn_v5261_ensure_tracking(v_box.id,v_branch);
  if v_tracking.active_transfer_id is not null or v_tracking.location_state='IN_TRANSIT' then
    raise exception 'กล่องกำลังอยู่ระหว่างส่ง';
  end if;
  if v_tracking.branch_id is not null
     and v_tracking.branch_id<>v_branch
     and v_tracking.location_state<>'EMPTY' then
    raise exception 'กล่องนี้ถูกระบุว่าอยู่คนละสาขา ต้องใช้กระบวนการโอนกล่อง';
  end if;
  v_state:=case when exists(select 1 from public.stock_box_items where box_id=v_box.id and quantity>0)
                then 'WAREHOUSE' else 'EMPTY' end;
  if upper(coalesce(p_requested_state,''))='EMPTY' and v_state='EMPTY' then v_state:='EMPTY'; end if;
  update public.tkn_v5261_box_tracking
  set branch_id=v_branch,location_state=v_state,updated_at=now()
  where box_id=v_box.id;
  return jsonb_build_object('box_code',v_box.box_code,'branch_id',v_branch,'location_state',v_state);
end $$;

-- ------------------------------------------------------------
-- 5) Read context
-- ------------------------------------------------------------
create or replace function public.tkn_v5261_get_box_context(p_box_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_box record; v_items jsonb; v_total numeric; v_cost numeric; v_normal numeric; v_transfer jsonb;
begin
  if not public.tkn_v5261_has_permission('inventory.view')
     and not public.tkn_v5261_has_permission('inventory.issue')
     and not public.tkn_v5261_has_permission('inventory.box_transfer')
     and not public.tkn_v5261_has_permission('pos.box_sale.create') then
    raise exception 'ไม่มีสิทธิ์ดูข้อมูลกล่อง';
  end if;

  select b.id,b.box_code,b.status,b.location_text,b.closed_at,
         t.branch_id,
         coalesce(case when t.active_transfer_id is not null then 'IN_TRANSIT' else t.location_state end,
                  case when exists(select 1 from public.stock_box_items x where x.box_id=b.id and x.quantity>0) then 'WAREHOUSE' else 'EMPTY' end) location_state,
         t.active_transfer_id,t.active_cycle_id,br.code branch_code,br.name branch_name
  into v_box
  from public.stock_boxes b
  left join public.tkn_v5261_box_tracking t on t.box_id=b.id
  left join public.branches br on br.id=t.branch_id
  where upper(b.box_code)=upper(btrim(p_box_code));
  if not found then raise exception 'ไม่พบกล่อง %',p_box_code; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',i.product_id,'sku',i.sku,'quantity',i.quantity,
    'product_name',coalesce(p.name,i.sku),'barcode',p.barcode,'lot_code',p.lot_code,
    'unit_cost',coalesce(p.cost_price,0),'unit_price',coalesce(p.selling_price,0),
    'cost_total',round(i.quantity*coalesce(p.cost_price,0),2),
    'normal_total',round(i.quantity*coalesce(p.selling_price,0),2)
  ) order by i.sku),'[]'::jsonb),coalesce(sum(i.quantity),0),
  coalesce(sum(i.quantity*coalesce(p.cost_price,0)),0),
  coalesce(sum(i.quantity*coalesce(p.selling_price,0)),0)
  into v_items,v_total,v_cost,v_normal
  from public.stock_box_items i
  left join public.products p on p.id=i.product_id
  where i.box_id=v_box.id and i.quantity>0;

  select jsonb_build_object(
    'id',td.id,'transfer_no',td.transfer_no,'status',td.status,
    'source_branch_id',td.source_branch_id,'source_branch_name',s.name,
    'destination_branch_id',td.destination_branch_id,'destination_branch_name',d.name,
    'sent_at',td.sent_at
  ) into v_transfer
  from public.transfer_documents td
  join public.branches s on s.id=td.source_branch_id
  join public.branches d on d.id=td.destination_branch_id
  where td.id=v_box.active_transfer_id;

  return jsonb_build_object(
    'box',jsonb_build_object(
      'id',v_box.id,'box_code',v_box.box_code,'status',v_box.status,
      'location_text',v_box.location_text,'location_state',v_box.location_state,
      'branch_id',v_box.branch_id,'branch_code',v_box.branch_code,'branch_name',v_box.branch_name,
      'active_transfer_id',v_box.active_transfer_id,'active_cycle_id',v_box.active_cycle_id,
      'closed_at',v_box.closed_at
    ),
    'items',v_items,'total_sku',jsonb_array_length(v_items),'total_quantity',v_total,
    'cost_total',round(v_cost,2),'normal_price_total',round(v_normal,2),'transfer',v_transfer
  );
end $$;

-- ------------------------------------------------------------
-- 6) Issue whole box to storefront
-- ------------------------------------------------------------
create or replace function public.tkn_v5261_issue_box_to_storefront(p_box_code text,p_branch_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare v_branch uuid:=public.tkn_v5261_resolve_branch(p_branch_id); v_box public.stock_boxes%rowtype; v_tracking public.tkn_v5261_box_tracking; v_cycle uuid; v_items jsonb; v_total numeric;
begin
  if not public.tkn_v5261_has_permission('inventory.issue')
     and not public.tkn_v5261_has_permission('product.manage') then
    raise exception 'ไม่มีสิทธิ์เบิกสินค้า';
  end if;
  select * into v_box from public.stock_boxes where upper(box_code)=upper(btrim(p_box_code)) for update;
  if not found then raise exception 'ไม่พบกล่อง %',p_box_code; end if;
  if upper(coalesce(v_box.status::text,''))<>'CLOSED' then raise exception 'ต้องปิดกล่องก่อนเบิก'; end if;
  v_tracking:=public.tkn_v5261_ensure_tracking(v_box.id,v_branch);
  if v_tracking.active_transfer_id is not null or v_tracking.location_state='IN_TRANSIT' then raise exception 'กล่องกำลังอยู่ระหว่างส่ง'; end if;
  if v_tracking.branch_id is not null and v_tracking.branch_id<>v_branch then raise exception 'กล่องอยู่คนละสาขา'; end if;
  if exists(
    select 1 from public.tkn_v5261_box_sale_draft_boxes db
    join public.tkn_v5261_box_sale_drafts d on d.id=db.draft_id
    where db.box_id=v_box.id and d.status='DRAFT' and d.lock_expires_at>now()
  ) then raise exception 'กล่องถูกล็อกอยู่ในรายการขายยกกล่อง'; end if;
  perform public.tkn_v5261_assert_box_items(v_box.id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',i.product_id,'sku',i.sku,'quantity',i.quantity,
    'product_name',coalesce(p.name,i.sku),'unit_cost',coalesce(p.cost_price,0),
    'unit_price',coalesce(p.selling_price,0)
  ) order by i.sku),'[]'::jsonb),coalesce(sum(i.quantity),0)
  into v_items,v_total
  from public.stock_box_items i left join public.products p on p.id=i.product_id
  where i.box_id=v_box.id and i.quantity>0;

  v_cycle:=public.tkn_v5261_ensure_cycle(v_box.id,v_branch);
  perform public.tkn_v5261_sync_cycle_items(v_cycle,v_box.id);

  delete from public.stock_box_items where box_id=v_box.id;
  update public.stock_boxes set status='DRAFT',closed_at=null where id=v_box.id;
  update public.tkn_v5261_box_cycles
  set status='ISSUED_TO_STOREFRONT',completed_at=now(),metadata=metadata||jsonb_build_object('items',v_items)
  where id=v_cycle;
  update public.tkn_v5261_box_tracking
  set branch_id=v_branch,location_state='EMPTY',active_transfer_id=null,active_cycle_id=null,updated_at=now()
  where box_id=v_box.id;
  insert into public.tkn_v5261_box_movements(
    box_id,cycle_id,action,from_branch_id,to_branch_id,from_location,to_location,detail
  ) values(
    v_box.id,v_cycle,'ISSUE_TO_STOREFRONT',v_branch,v_branch,'WAREHOUSE','STOREFRONT',
    jsonb_build_object('total_sku',jsonb_array_length(v_items),'total_quantity',v_total,'items',v_items)
  );
  return jsonb_build_object(
    'box_code',v_box.box_code,'cycle_id',v_cycle,'branch_id',v_branch,
    'total_sku',jsonb_array_length(v_items),'total_quantity',v_total,'items',v_items,
    'box_status','DRAFT','box_location_state','EMPTY','product_location_state','STOREFRONT'
  );
end $$;

-- ------------------------------------------------------------
-- 7) Transfer / receive whole box
-- ------------------------------------------------------------
create or replace function public.tkn_v5261_transfer_whole_box(
  p_box_code text,p_source_branch_id uuid,p_destination_branch_id uuid,p_notes text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare v_source uuid:=public.tkn_v5261_resolve_branch(p_source_branch_id); v_dest uuid:=public.tkn_v5261_resolve_branch(p_destination_branch_id); v_box public.stock_boxes%rowtype; v_tracking public.tkn_v5261_box_tracking; v_cycle uuid; v_items jsonb; v_transfer public.transfer_documents;
begin
  if not public.tkn_v5261_has_permission('inventory.box_transfer')
     and not public.tkn_v5261_has_permission('inventory.transfer') then
    raise exception 'ไม่มีสิทธิ์โอนกล่อง';
  end if;
  if v_source=v_dest then raise exception 'ต้นทางและปลายทางต้องต่างกัน'; end if;
  select * into v_box from public.stock_boxes where upper(box_code)=upper(btrim(p_box_code)) for update;
  if not found then raise exception 'ไม่พบกล่อง %',p_box_code; end if;
  if upper(coalesce(v_box.status::text,''))<>'CLOSED' then raise exception 'ต้องปิดกล่องก่อนโอน'; end if;
  v_tracking:=public.tkn_v5261_ensure_tracking(v_box.id,v_source);
  if v_tracking.active_transfer_id is not null or v_tracking.location_state='IN_TRANSIT' then raise exception 'กล่องมีใบโอนที่กำลังเดินทางอยู่แล้ว'; end if;
  if v_tracking.branch_id is not null and v_tracking.branch_id<>v_source then raise exception 'กล่องไม่ได้อยู่ที่สาขาต้นทาง'; end if;
  if exists(
    select 1 from public.tkn_v5261_box_sale_draft_boxes db
    join public.tkn_v5261_box_sale_drafts d on d.id=db.draft_id
    where db.box_id=v_box.id and d.status='DRAFT' and d.lock_expires_at>now()
  ) then raise exception 'กล่องถูกล็อกอยู่ในรายการขายยกกล่อง'; end if;
  perform public.tkn_v5261_assert_box_items(v_box.id);

  select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity)),'[]'::jsonb)
  into v_items from public.stock_box_items where box_id=v_box.id and product_id is not null and quantity>0;
  if jsonb_array_length(v_items)=0 then raise exception 'กล่องไม่มีสินค้าที่ผูกฐาน'; end if;

  v_cycle:=public.tkn_v5261_ensure_cycle(v_box.id,v_source);
  perform public.tkn_v5261_sync_cycle_items(v_cycle,v_box.id);
  select * into v_transfer from public.create_branch_transfer(
    v_source,v_dest,v_items,v_box.box_code,
    concat_ws(' · ',nullif(btrim(p_notes),''),'โอนทั้งกล่อง '||v_box.box_code)
  );

  update public.tkn_v5261_box_tracking
  set branch_id=v_source,location_state='IN_TRANSIT',active_transfer_id=v_transfer.id,
      active_cycle_id=v_cycle,updated_at=now()
  where box_id=v_box.id;
  update public.tkn_v5261_box_cycles set status='IN_TRANSIT' where id=v_cycle;
  insert into public.tkn_v5261_box_transfer_links(transfer_id,box_id,cycle_id)
  values(v_transfer.id,v_box.id,v_cycle)
  on conflict(transfer_id,box_id) do nothing;
  insert into public.tkn_v5261_box_movements(
    box_id,cycle_id,action,from_branch_id,to_branch_id,from_location,to_location,transfer_id,detail
  ) values(
    v_box.id,v_cycle,'TRANSFER_SENT',v_source,v_dest,'WAREHOUSE','IN_TRANSIT',v_transfer.id,
    jsonb_build_object('transfer_no',v_transfer.transfer_no,'box_code',v_box.box_code)
  );
  return jsonb_build_object(
    'box_code',v_box.box_code,'cycle_id',v_cycle,'transfer_id',v_transfer.id,
    'transfer_no',v_transfer.transfer_no,'source_branch_id',v_source,
    'destination_branch_id',v_dest,'status','IN_TRANSIT'
  );
end $$;

create or replace function public.tkn_v5261_receive_whole_box(p_box_code text,p_receiving_branch_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare v_branch uuid:=public.tkn_v5261_resolve_branch(p_receiving_branch_id); v_box public.stock_boxes%rowtype; v_tracking public.tkn_v5261_box_tracking; v_transfer public.transfer_documents; v_cycle uuid;
begin
  if not public.tkn_v5261_has_permission('inventory.box_transfer')
     and not public.tkn_v5261_has_permission('inventory.transfer')
     and not public.tkn_v5261_has_permission('inventory.receive') then
    raise exception 'ไม่มีสิทธิ์รับกล่อง';
  end if;
  select * into v_box from public.stock_boxes where upper(box_code)=upper(btrim(p_box_code)) for update;
  if not found then raise exception 'ไม่พบกล่อง %',p_box_code; end if;
  select * into v_tracking from public.tkn_v5261_box_tracking where box_id=v_box.id for update;
  if not found or v_tracking.location_state<>'IN_TRANSIT' or v_tracking.active_transfer_id is null then
    raise exception 'กล่องนี้ไม่ได้อยู่ระหว่างส่ง';
  end if;
  select * into v_transfer from public.transfer_documents where id=v_tracking.active_transfer_id for update;
  if not found then raise exception 'ไม่พบใบโอนของกล่อง'; end if;
  if v_transfer.destination_branch_id<>v_branch then raise exception 'สาขานี้ไม่ใช่ปลายทางของกล่อง'; end if;
  if v_transfer.status::text='IN_TRANSIT' then
    perform public.receive_branch_transfer(v_transfer.id);
  elsif v_transfer.status::text<>'RECEIVED' then
    raise exception 'ใบโอนไม่อยู่ในสถานะรอรับหรือรับแล้ว';
  end if;
  -- รองรับกรณีผู้ใช้กดรับจากหน้าใบโอนเดิมก่อน แล้วค่อยสแกน QR กล่องเพื่อยืนยันตำแหน่ง
  v_cycle:=v_tracking.active_cycle_id;
  update public.tkn_v5261_box_tracking
  set branch_id=v_branch,location_state='WAREHOUSE',active_transfer_id=null,updated_at=now()
  where box_id=v_box.id;
  update public.tkn_v5261_box_cycles set branch_id=v_branch,status='CLOSED' where id=v_cycle;
  insert into public.tkn_v5261_box_movements(
    box_id,cycle_id,action,from_branch_id,to_branch_id,from_location,to_location,transfer_id,detail
  ) values(
    v_box.id,v_cycle,'TRANSFER_RECEIVED',v_transfer.source_branch_id,v_branch,'IN_TRANSIT','WAREHOUSE',v_transfer.id,
    jsonb_build_object('transfer_no',v_transfer.transfer_no,'box_code',v_box.box_code)
  );
  return jsonb_build_object(
    'box_code',v_box.box_code,'cycle_id',v_cycle,'transfer_id',v_transfer.id,
    'transfer_no',v_transfer.transfer_no,'branch_id',v_branch,'status','RECEIVED',
    'next_actions',jsonb_build_array('KEEP_WAREHOUSE','ISSUE_STOREFRONT','FORWARD_BRANCH')
  );
end $$;

-- ------------------------------------------------------------
-- 8) Mobile POS box sale
-- ------------------------------------------------------------
create or replace function public.tkn_v5261_box_sale_start(p_branch_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path=''
as $$
declare v_id uuid; v_branch uuid:=public.tkn_v5261_resolve_branch(p_branch_id);
begin
  if not public.tkn_v5261_has_permission('pos.box_sale.create') then raise exception 'ไม่มีสิทธิ์ขายยกกล่อง'; end if;
  update public.tkn_v5261_box_sale_drafts set status='EXPIRED',updated_at=now()
  where status='DRAFT' and lock_expires_at<now();
  insert into public.tkn_v5261_box_sale_drafts(branch_id) values(v_branch) returning id into v_id;
  return v_id;
end $$;

create or replace function public.tkn_v5261_box_sale_preview(p_draft_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_draft public.tkn_v5261_box_sale_drafts%rowtype; v_boxes jsonb; v_items jsonb;
begin
  select * into v_draft from public.tkn_v5261_box_sale_drafts where id=p_draft_id;
  if not found then raise exception 'ไม่พบร่างขายยกกล่อง'; end if;
  if v_draft.created_by<>auth.uid() and not public.tkn_v5261_has_permission('pos.box_sale.cancel') then raise exception 'ไม่มีสิทธิ์เปิดร่างนี้'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'box_id',b.id,'box_code',b.box_code,'cycle_id',db.cycle_id,
    'sku_count',(select count(*) from public.tkn_v5261_box_sale_draft_items di where di.draft_id=db.draft_id and di.box_id=db.box_id),
    'total_quantity',(select coalesce(sum(quantity),0) from public.tkn_v5261_box_sale_draft_items di where di.draft_id=db.draft_id and di.box_id=db.box_id)
  ) order by db.created_at),'[]'::jsonb)
  into v_boxes
  from public.tkn_v5261_box_sale_draft_boxes db join public.stock_boxes b on b.id=db.box_id
  where db.draft_id=p_draft_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',q.product_id,'sku',q.sku,'product_name',q.product_name,
    'quantity',q.quantity,'unit_cost',q.unit_cost,'unit_price',q.unit_price,
    'cost_total',round(q.quantity*q.unit_cost,2),'normal_total',round(q.quantity*q.unit_price,2)
  ) order by q.sku),'[]'::jsonb)
  into v_items
  from (
    select product_id,sku,max(product_name_snapshot) product_name,sum(quantity) quantity,
           case when sum(quantity)=0 then 0 else sum(quantity*unit_cost_snapshot)/sum(quantity) end unit_cost,
           case when sum(quantity)=0 then 0 else sum(quantity*unit_price_snapshot)/sum(quantity) end unit_price
    from public.tkn_v5261_box_sale_draft_items where draft_id=p_draft_id
    group by product_id,sku
  ) q;

  return jsonb_build_object(
    'draft',jsonb_build_object('id',v_draft.id,'branch_id',v_draft.branch_id,'status',v_draft.status,'lock_expires_at',v_draft.lock_expires_at),
    'boxes',v_boxes,'items',v_items,'box_count',jsonb_array_length(v_boxes),'sku_count',jsonb_array_length(v_items),
    'total_quantity',coalesce((select sum(quantity) from public.tkn_v5261_box_sale_draft_items where draft_id=p_draft_id),0),
    'cost_total',round(coalesce((select sum(quantity*unit_cost_snapshot) from public.tkn_v5261_box_sale_draft_items where draft_id=p_draft_id),0),2),
    'normal_price_total',round(coalesce((select sum(quantity*unit_price_snapshot) from public.tkn_v5261_box_sale_draft_items where draft_id=p_draft_id),0),2)
  );
end $$;

create or replace function public.tkn_v5261_box_sale_add_box(p_draft_id uuid,p_box_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare v_draft public.tkn_v5261_box_sale_drafts%rowtype; v_box public.stock_boxes%rowtype; v_tracking public.tkn_v5261_box_tracking; v_cycle uuid; v_hash text;
begin
  if not public.tkn_v5261_has_permission('pos.box_sale.create') then raise exception 'ไม่มีสิทธิ์ขายยกกล่อง'; end if;
  select * into v_draft from public.tkn_v5261_box_sale_drafts where id=p_draft_id for update;
  if not found or v_draft.status<>'DRAFT' then raise exception 'ร่างขายไม่พร้อมใช้งาน'; end if;
  if v_draft.created_by<>auth.uid() then raise exception 'ร่างขายนี้เป็นของผู้ใช้อื่น'; end if;
  if v_draft.lock_expires_at<now() then raise exception 'ร่างขายหมดเวลา'; end if;

  select * into v_box from public.stock_boxes where upper(box_code)=upper(btrim(p_box_code)) for update;
  if not found then raise exception 'ไม่พบกล่อง %',p_box_code; end if;
  if upper(coalesce(v_box.status::text,''))<>'CLOSED' then raise exception 'กล่องต้องอยู่ในสถานะปิดแล้ว'; end if;
  v_tracking:=public.tkn_v5261_ensure_tracking(v_box.id,v_draft.branch_id);
  if v_tracking.active_transfer_id is not null or v_tracking.location_state='IN_TRANSIT' then raise exception 'กล่องกำลังอยู่ระหว่างส่ง'; end if;
  if v_tracking.branch_id is not null and v_tracking.branch_id<>v_draft.branch_id then raise exception 'ห้ามรวมกล่องจากคนละสาขา'; end if;
  perform public.tkn_v5261_assert_box_items(v_box.id);
  if exists(select 1 from public.tkn_v5261_box_sale_draft_boxes where draft_id=p_draft_id and box_id=v_box.id) then raise exception 'สแกนกล่องนี้แล้ว'; end if;
  if exists(
    select 1 from public.tkn_v5261_box_sale_draft_boxes db
    join public.tkn_v5261_box_sale_drafts d on d.id=db.draft_id
    where db.box_id=v_box.id and d.id<>p_draft_id and d.status='DRAFT' and d.lock_expires_at>now()
  ) then raise exception 'กล่องถูกล็อกอยู่ในรายการขายอื่น'; end if;

  update public.tkn_v5261_box_tracking set branch_id=v_draft.branch_id,location_state='WAREHOUSE',updated_at=now() where box_id=v_box.id;
  v_cycle:=public.tkn_v5261_ensure_cycle(v_box.id,v_draft.branch_id);
  perform public.tkn_v5261_sync_cycle_items(v_cycle,v_box.id);
  v_hash:=public.tkn_v5261_box_hash(v_box.id);

  insert into public.tkn_v5261_box_sale_draft_boxes(draft_id,box_id,cycle_id,item_hash)
  values(p_draft_id,v_box.id,v_cycle,v_hash);
  insert into public.tkn_v5261_box_sale_draft_items(
    draft_id,box_id,cycle_id,product_id,sku,product_name_snapshot,lot_code_snapshot,
    quantity,unit_cost_snapshot,unit_price_snapshot
  )
  select p_draft_id,v_box.id,v_cycle,i.product_id,i.sku,p.name,p.lot_code,
         i.quantity,coalesce(p.cost_price,0),coalesce(p.selling_price,0)
  from public.stock_box_items i join public.products p on p.id=i.product_id
  where i.box_id=v_box.id and i.quantity>0;
  update public.tkn_v5261_box_sale_drafts set lock_expires_at=now()+interval '30 minutes',updated_at=now() where id=p_draft_id;
  return public.tkn_v5261_box_sale_preview(p_draft_id);
end $$;

create or replace function public.tkn_v5261_box_sale_remove_box(p_draft_id uuid,p_box_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare v_box_id uuid;
begin
  if not public.tkn_v5261_has_permission('pos.box_sale.create') then raise exception 'ไม่มีสิทธิ์ขายยกกล่อง'; end if;
  if not exists(select 1 from public.tkn_v5261_box_sale_drafts where id=p_draft_id and created_by=auth.uid() and status='DRAFT') then raise exception 'ไม่พบร่างขายที่แก้ไขได้'; end if;
  select id into v_box_id from public.stock_boxes where upper(box_code)=upper(btrim(p_box_code));
  delete from public.tkn_v5261_box_sale_draft_items where draft_id=p_draft_id and box_id=v_box_id;
  delete from public.tkn_v5261_box_sale_draft_boxes where draft_id=p_draft_id and box_id=v_box_id;
  update public.tkn_v5261_box_sale_drafts set lock_expires_at=now()+interval '30 minutes',updated_at=now() where id=p_draft_id;
  return public.tkn_v5261_box_sale_preview(p_draft_id);
end $$;

create or replace function public.tkn_v5261_box_sale_cancel(p_draft_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path=''
as $$
begin
  if not public.tkn_v5261_has_permission('pos.box_sale.create') then raise exception 'ไม่มีสิทธิ์ขายยกกล่อง'; end if;
  update public.tkn_v5261_box_sale_drafts
  set status='CANCELLED',updated_at=now()
  where id=p_draft_id and status='DRAFT'
    and (created_by=auth.uid() or public.tkn_v5261_has_permission('pos.box_sale.cancel'));
  return found;
end $$;

create or replace function public.tkn_v5261_complete_box_sale(
  p_draft_id uuid,
  p_pricing_mode text,
  p_lump_price numeric default null,
  p_payment_method text default 'CASH',
  p_received_amount numeric default 0,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_draft public.tkn_v5261_box_sale_drafts%rowtype;
  v_sale public.sales%rowtype;
  v_mode text:=upper(btrim(p_pricing_mode));
  v_cost numeric(14,2); v_normal numeric(14,2); v_target numeric(14,2);
  v_weight_total numeric; v_allocated numeric(14,2):=0; v_line numeric(14,2); v_unit numeric(14,2); v_line_discount numeric(14,2);
  v_count integer; v_index integer:=0; v_box_count integer; v_sku_count integer; v_qty numeric;
  v_pos_items jsonb:='[]'::jsonb; v_box_sale_id uuid;
  r record; b record;
begin
  if not public.tkn_v5261_has_permission('pos.box_sale.create') then raise exception 'ไม่มีสิทธิ์ขายยกกล่อง'; end if;
  if v_mode not in ('SKU','LUMP') then raise exception 'รูปแบบราคาไม่ถูกต้อง'; end if;
  if v_mode='LUMP' and not public.tkn_v5261_has_permission('pos.box_sale.lump_price') then raise exception 'ไม่มีสิทธิ์กำหนดราคาเหมา'; end if;

  select * into v_draft from public.tkn_v5261_box_sale_drafts where id=p_draft_id for update;
  if not found or v_draft.status<>'DRAFT' then raise exception 'ร่างขายไม่พร้อมใช้งาน'; end if;
  if v_draft.created_by<>auth.uid() then raise exception 'ร่างขายนี้เป็นของผู้ใช้อื่น'; end if;
  if v_draft.lock_expires_at<now() then raise exception 'ร่างขายหมดเวลา'; end if;

  select count(*),count(distinct product_id),coalesce(sum(quantity),0),
         round(coalesce(sum(quantity*unit_cost_snapshot),0),2),
         round(coalesce(sum(quantity*unit_price_snapshot),0),2)
  into v_count,v_sku_count,v_qty,v_cost,v_normal
  from public.tkn_v5261_box_sale_draft_items where draft_id=p_draft_id;
  select count(*) into v_box_count from public.tkn_v5261_box_sale_draft_boxes where draft_id=p_draft_id;
  if v_box_count=0 or v_count=0 then raise exception 'ยังไม่ได้สแกนกล่อง'; end if;

  for b in
    select db.box_id,db.item_hash,sb.box_code,sb.status,t.location_state,t.branch_id,t.active_transfer_id
    from public.tkn_v5261_box_sale_draft_boxes db
    join public.stock_boxes sb on sb.id=db.box_id
    left join public.tkn_v5261_box_tracking t on t.box_id=db.box_id
    where db.draft_id=p_draft_id order by db.box_id for update of sb
  loop
    if upper(coalesce(b.status::text,''))<>'CLOSED' then raise exception 'กล่อง % ไม่พร้อมขายแล้ว',b.box_code; end if;
    if coalesce(b.location_state,'WAREHOUSE')<>'WAREHOUSE' or b.active_transfer_id is not null then raise exception 'กล่อง % ไม่อยู่ในคลัง',b.box_code; end if;
    if b.branch_id is not null and b.branch_id<>v_draft.branch_id then raise exception 'กล่อง % ถูกย้ายสาขาแล้ว',b.box_code; end if;
    if public.tkn_v5261_box_hash(b.box_id)<>b.item_hash then raise exception 'สินค้าในกล่อง % เปลี่ยนแปลง กรุณาสแกนใหม่',b.box_code; end if;
  end loop;

  v_target:=case when v_mode='SKU' then v_normal else round(coalesce(p_lump_price,0),2) end;
  if v_target<0 then raise exception 'ราคาขายต้องไม่น้อยกว่า 0'; end if;
  if v_target<v_cost and not public.tkn_v5261_has_permission('pos.box_sale.below_cost') then raise exception 'ราคาขายต่ำกว่าต้นทุน ต้องใช้สิทธิ์ Owner หรือ Admin'; end if;

  select count(*) into v_count from (
    select product_id from public.tkn_v5261_box_sale_draft_items where draft_id=p_draft_id group by product_id
  ) x;
  v_weight_total:=case when v_normal>0 then v_normal when v_cost>0 then v_cost else v_qty end;

  for r in
    select product_id,max(sku) sku,sum(quantity) quantity,
           sum(quantity*unit_cost_snapshot) cost_total,
           sum(quantity*unit_price_snapshot) normal_total
    from public.tkn_v5261_box_sale_draft_items where draft_id=p_draft_id
    group by product_id order by product_id
  loop
    v_index:=v_index+1;
    if v_mode='SKU' then
      v_line:=round(r.normal_total,2);
    elsif v_index=v_count then
      v_line:=v_target-v_allocated;
    else
      v_line:=round(v_target*(case when v_normal>0 then r.normal_total when v_cost>0 then r.cost_total else r.quantity end)/nullif(v_weight_total,0),2);
      v_allocated:=v_allocated+v_line;
    end if;
    if r.quantity<=0 then raise exception 'จำนวนสินค้าไม่ถูกต้อง'; end if;
    v_unit:=ceil((v_line/r.quantity)*100)/100;
    v_line_discount:=round((v_unit*r.quantity)-v_line,2);
    if v_line_discount<0 then v_line_discount:=0; end if;
    v_pos_items:=v_pos_items||jsonb_build_array(jsonb_build_object(
      'product_id',r.product_id,'quantity',r.quantity,'unit_price',v_unit,'discount_amount',v_line_discount
    ));
  end loop;

  select * into v_sale from public.create_pos_sale(
    v_draft.branch_id,v_pos_items,0,p_payment_method,p_received_amount,
    p_customer_name,p_customer_phone,
    concat_ws(E'\n',nullif(btrim(p_notes),''),'ขายยกกล่อง '||v_box_count||' กล่อง · '||v_mode)
  );

  insert into public.tkn_v5261_box_sales(
    sale_id,draft_id,branch_id,pricing_mode,box_count,sku_count,total_quantity,
    normal_price_total,cost_total,sale_total,gross_profit
  ) values(
    v_sale.id,p_draft_id,v_draft.branch_id,v_mode,v_box_count,v_sku_count,v_qty,
    v_normal,v_cost,v_sale.net_total,v_sale.net_total-v_cost
  ) returning id into v_box_sale_id;

  insert into public.tkn_v5261_box_sale_items(
    box_sale_id,product_id,sku,quantity,unit_cost_snapshot,cost_total,normal_price_total,allocated_sale_total
  )
  select v_box_sale_id,di.product_id,max(di.sku),sum(di.quantity),
         case when sum(di.quantity)=0 then 0 else sum(di.quantity*di.unit_cost_snapshot)/sum(di.quantity) end,
         round(sum(di.quantity*di.unit_cost_snapshot),2),round(sum(di.quantity*di.unit_price_snapshot),2),
         coalesce(max(si.line_total),0)
  from public.tkn_v5261_box_sale_draft_items di
  left join public.sale_items si on si.sale_id=v_sale.id and si.product_id=di.product_id
  where di.draft_id=p_draft_id
  group by di.product_id;

  for b in
    select db.box_id,db.cycle_id,sb.box_code
    from public.tkn_v5261_box_sale_draft_boxes db join public.stock_boxes sb on sb.id=db.box_id
    where db.draft_id=p_draft_id order by db.box_id
  loop
    insert into public.tkn_v5261_box_sale_boxes(box_sale_id,box_id,cycle_id)
    values(v_box_sale_id,b.box_id,b.cycle_id);
    delete from public.stock_box_items where box_id=b.box_id;
    update public.stock_boxes set status='DRAFT',closed_at=null where id=b.box_id;
    update public.tkn_v5261_box_cycles
    set status='SOLD',completed_at=now(),metadata=metadata||jsonb_build_object('sale_id',v_sale.id)
    where id=b.cycle_id;
    update public.tkn_v5261_box_tracking
    set location_state='EMPTY',active_transfer_id=null,active_cycle_id=null,updated_at=now()
    where box_id=b.box_id;
    insert into public.tkn_v5261_box_movements(
      box_id,cycle_id,action,from_branch_id,to_branch_id,from_location,to_location,sale_id,detail
    ) values(
      b.box_id,b.cycle_id,'BOX_SOLD',v_draft.branch_id,v_draft.branch_id,'WAREHOUSE','EMPTY',v_sale.id,
      jsonb_build_object('sale_no',v_sale.sale_no,'pricing_mode',v_mode)
    );
  end loop;

  update public.tkn_v5261_box_sale_drafts
  set status='COMPLETED',pricing_mode=v_mode,lump_price=case when v_mode='LUMP' then v_sale.net_total else null end,
      sale_id=v_sale.id,updated_at=now()
  where id=p_draft_id;

  return jsonb_build_object(
    'sale_id',v_sale.id,'sale_no',v_sale.sale_no,'box_sale_id',v_box_sale_id,
    'pricing_mode',v_mode,'box_count',v_box_count,'sku_count',v_sku_count,
    'total_quantity',v_qty,'cost_total',v_cost,'normal_price_total',v_normal,
    'net_total',v_sale.net_total,'gross_profit',v_sale.net_total-v_cost,
    'received_amount',v_sale.received_amount,'change_amount',v_sale.change_amount
  );
end $$;

-- ------------------------------------------------------------
-- 9) Read-only views
-- ------------------------------------------------------------
create or replace view public.tkn_v5261_box_item_locations
with (security_invoker=true) as
select i.box_id,i.product_id,i.sku,i.quantity,b.box_code,b.status,b.location_text,
       t.branch_id,br.code branch_code,br.name branch_name,
       coalesce(case when t.active_transfer_id is not null then 'IN_TRANSIT' else t.location_state end,'WAREHOUSE') location_state,
       t.active_transfer_id
from public.stock_box_items i
join public.stock_boxes b on b.id=i.box_id
left join public.tkn_v5261_box_tracking t on t.box_id=b.id
left join public.branches br on br.id=t.branch_id
where i.quantity>0;

create or replace view public.tkn_v5261_product_stock_position
with (security_invoker=true) as
with boxed as (
  select t.branch_id,i.product_id,sum(i.quantity) quantity
  from public.tkn_v5261_box_tracking t
  join public.stock_box_items i on i.box_id=t.box_id
  where t.location_state='WAREHOUSE' and t.active_transfer_id is null and t.branch_id is not null and i.quantity>0
  group by t.branch_id,i.product_id
), transit as (
  select td.destination_branch_id branch_id,ti.product_id,sum(ti.quantity_sent-ti.quantity_received) quantity
  from public.transfer_documents td join public.transfer_items ti on ti.transfer_id=td.id
  where td.status::text='IN_TRANSIT'
  group by td.destination_branch_id,ti.product_id
), sold as (
  select s.branch_id,si.product_id,sum(si.quantity) quantity
  from public.sales s join public.sale_items si on si.sale_id=s.id
  where s.status::text='COMPLETED'
  group by s.branch_id,si.product_id
)
select bi.branch_id,b.code branch_code,b.name branch_name,bi.product_id,p.product_code,p.barcode,p.name product_name,
       bi.quantity stock_remaining,coalesce(bx.quantity,0) in_box,
       greatest(bi.quantity-coalesce(bx.quantity,0),0) outside_box_available,
       coalesce(tr.quantity,0) in_transit_to_branch,coalesce(sd.quantity,0) sold_quantity,
       p.cost_price,p.selling_price
from public.branch_inventory bi
join public.branches b on b.id=bi.branch_id
join public.products p on p.id=bi.product_id
left join boxed bx on bx.branch_id=bi.branch_id and bx.product_id=bi.product_id
left join transit tr on tr.branch_id=bi.branch_id and tr.product_id=bi.product_id
left join sold sd on sd.branch_id=bi.branch_id and sd.product_id=bi.product_id;

-- ------------------------------------------------------------
-- 10) RLS only on new sidecar tables
-- ------------------------------------------------------------
alter table public.tkn_v5261_box_tracking enable row level security;
alter table public.tkn_v5261_box_cycles enable row level security;
alter table public.tkn_v5261_box_cycle_items enable row level security;
alter table public.tkn_v5261_box_movements enable row level security;
alter table public.tkn_v5261_box_transfer_links enable row level security;
alter table public.tkn_v5261_box_sale_drafts enable row level security;
alter table public.tkn_v5261_box_sale_draft_boxes enable row level security;
alter table public.tkn_v5261_box_sale_draft_items enable row level security;
alter table public.tkn_v5261_box_sales enable row level security;
alter table public.tkn_v5261_box_sale_boxes enable row level security;
alter table public.tkn_v5261_box_sale_items enable row level security;

do $$
declare t text; p text;
begin
  foreach t in array array[
    'tkn_v5261_box_tracking','tkn_v5261_box_cycles','tkn_v5261_box_cycle_items',
    'tkn_v5261_box_movements','tkn_v5261_box_transfer_links','tkn_v5261_box_sale_drafts',
    'tkn_v5261_box_sale_draft_boxes','tkn_v5261_box_sale_draft_items','tkn_v5261_box_sales',
    'tkn_v5261_box_sale_boxes','tkn_v5261_box_sale_items'
  ] loop
    p:='read_'||t;
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname=p) then
      execute format('create policy %I on public.%I for select to authenticated using (public.is_active_user())',p,t);
    end if;
  end loop;
end $$;

grant select on public.tkn_v5261_box_tracking,public.tkn_v5261_box_cycles,
 public.tkn_v5261_box_cycle_items,public.tkn_v5261_box_movements,
 public.tkn_v5261_box_transfer_links,public.tkn_v5261_box_sale_drafts,
 public.tkn_v5261_box_sale_draft_boxes,public.tkn_v5261_box_sale_draft_items,
 public.tkn_v5261_box_sales,public.tkn_v5261_box_sale_boxes,
 public.tkn_v5261_box_sale_items,public.tkn_v5261_box_item_locations,
 public.tkn_v5261_product_stock_position to authenticated;

revoke all on function public.tkn_v5261_has_permission(text) from public,anon;
revoke all on function public.tkn_v5261_resolve_branch(uuid) from public,anon;
revoke all on function public.tkn_v5261_assert_box_items(uuid) from public,anon;
revoke all on function public.tkn_v5261_effective_location(uuid) from public,anon;
revoke all on function public.tkn_v5261_ensure_tracking(uuid,uuid) from public,anon;
revoke all on function public.tkn_v5261_ensure_cycle(uuid,uuid) from public,anon;
revoke all on function public.tkn_v5261_sync_cycle_items(uuid,uuid) from public,anon;
revoke all on function public.tkn_v5261_box_hash(uuid) from public,anon;
revoke all on function public.tkn_v5261_register_box_location(text,uuid,text) from public,anon;
revoke all on function public.tkn_v5261_get_box_context(text) from public,anon;
revoke all on function public.tkn_v5261_issue_box_to_storefront(text,uuid) from public,anon;
revoke all on function public.tkn_v5261_transfer_whole_box(text,uuid,uuid,text) from public,anon;
revoke all on function public.tkn_v5261_receive_whole_box(text,uuid) from public,anon;
revoke all on function public.tkn_v5261_box_sale_start(uuid) from public,anon;
revoke all on function public.tkn_v5261_box_sale_preview(uuid) from public,anon;
revoke all on function public.tkn_v5261_box_sale_add_box(uuid,text) from public,anon;
revoke all on function public.tkn_v5261_box_sale_remove_box(uuid,text) from public,anon;
revoke all on function public.tkn_v5261_box_sale_cancel(uuid) from public,anon;
revoke all on function public.tkn_v5261_complete_box_sale(uuid,text,numeric,text,numeric,text,text,text) from public,anon;

grant execute on function public.tkn_v5261_register_box_location(text,uuid,text) to authenticated;
grant execute on function public.tkn_v5261_get_box_context(text) to authenticated;
grant execute on function public.tkn_v5261_issue_box_to_storefront(text,uuid) to authenticated;
grant execute on function public.tkn_v5261_transfer_whole_box(text,uuid,uuid,text) to authenticated;
grant execute on function public.tkn_v5261_receive_whole_box(text,uuid) to authenticated;
grant execute on function public.tkn_v5261_box_sale_start(uuid) to authenticated;
grant execute on function public.tkn_v5261_box_sale_preview(uuid) to authenticated;
grant execute on function public.tkn_v5261_box_sale_add_box(uuid,text) to authenticated;
grant execute on function public.tkn_v5261_box_sale_remove_box(uuid,text) to authenticated;
grant execute on function public.tkn_v5261_box_sale_cancel(uuid) to authenticated;
grant execute on function public.tkn_v5261_complete_box_sale(uuid,text,numeric,text,numeric,text,text,text) to authenticated;


commit;
