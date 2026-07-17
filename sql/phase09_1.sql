-- ============================================================
-- PHASE 09.1
-- SUPPLIER + PURCHASE ORDER
-- ร้านเถ้าแก่น้อยชลบุรี
-- FULL PROJECT UPDATE
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.products') is null then
    raise exception 'ไม่พบ public.products';
  end if;

  if to_regclass('public.branches') is null then
    raise exception 'ไม่พบ public.branches';
  end if;
end;
$$;

do $$
begin
  create type public.purchase_order_status as enum (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'PARTIALLY_RECEIVED',
    'RECEIVED',
    'CANCELLED'
  );
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.suppliers (
  id uuid primary key default extensions.gen_random_uuid(),
  supplier_code text not null unique,
  supplier_name text not null,
  contact_name text,
  phone text,
  email text,
  tax_id text,
  address text,
  payment_terms_days integer not null default 0
    check (payment_terms_days >= 0),
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_suppliers_updated_at on public.suppliers;
create trigger trg_suppliers_updated_at
before update on public.suppliers
for each row execute function public.set_updated_at();

create table if not exists public.purchase_orders (
  id uuid primary key default extensions.gen_random_uuid(),
  po_no text not null unique,

  supplier_id uuid not null
    references public.suppliers(id)
    on update cascade
    on delete restrict,

  branch_id uuid not null
    references public.branches(id)
    on update cascade
    on delete restrict,

  status public.purchase_order_status not null default 'DRAFT',

  order_date date not null default current_date,
  expected_date date,

  subtotal numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,

  reference_no text,
  notes text,

  created_by uuid references auth.users(id) on delete set null,
  submitted_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  cancelled_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_order_items (
  id uuid primary key default extensions.gen_random_uuid(),
  purchase_order_id uuid not null
    references public.purchase_orders(id)
    on update cascade
    on delete cascade,

  product_id uuid not null
    references public.products(id)
    on update cascade
    on delete restrict,

  quantity numeric(14,3) not null
    check (quantity > 0),

  received_quantity numeric(14,3) not null default 0
    check (received_quantity >= 0),

  unit_cost numeric(14,2) not null
    check (unit_cost >= 0),

  discount_amount numeric(14,2) not null default 0
    check (discount_amount >= 0),

  vat_rate numeric(5,2) not null default 0
    check (vat_rate >= 0 and vat_rate <= 100),

  line_subtotal numeric(14,2) not null default 0,
  line_vat numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,

  product_code_snapshot text,
  product_name_snapshot text,
  barcode_snapshot text,

  created_at timestamptz not null default now(),

  unique(purchase_order_id, product_id)
);

create index if not exists idx_suppliers_name
on public.suppliers(lower(supplier_name));

create index if not exists idx_purchase_orders_supplier
on public.purchase_orders(supplier_id, created_at desc);

create index if not exists idx_purchase_orders_branch
on public.purchase_orders(branch_id, created_at desc);

create index if not exists idx_purchase_orders_status
on public.purchase_orders(status);

insert into public.code_sequences(
  sequence_name,current_value,prefix,number_length
)
values(
  'PURCHASE_ORDER',0,'PO',6
)
on conflict(sequence_name) do nothing;

create or replace function public.generate_next_po_no()
returns text
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  n bigint;
  p text;
  l integer;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;

  select current_value+1,prefix,number_length
  into n,p,l
  from public.code_sequences
  where sequence_name='PURCHASE_ORDER'
  for update;

  if not found then
    raise exception 'ไม่พบลำดับ PURCHASE_ORDER';
  end if;

  update public.code_sequences
  set current_value=n,updated_at=now()
  where sequence_name='PURCHASE_ORDER';

  return p||to_char(current_date,'YYYYMMDD')||'-'||lpad(n::text,l,'0');
end;
$$;

create or replace function public.create_purchase_order(
  p_supplier_id uuid,
  p_branch_id uuid,
  p_items jsonb,
  p_order_date date default current_date,
  p_expected_date date default null,
  p_discount_amount numeric default 0,
  p_reference_no text default null,
  p_notes text default null
)
returns public.purchase_orders
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  po public.purchase_orders;
  i record;
  prod public.products;
  v_line_subtotal numeric(14,2);
  v_line_vat numeric(14,2);
  v_line_total numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_vat numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items)=0 then
    raise exception 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ';
  end if;

  insert into public.purchase_orders(
    po_no,supplier_id,branch_id,status,order_date,
    expected_date,discount_amount,reference_no,notes,created_by
  )
  values(
    public.generate_next_po_no(),
    p_supplier_id,
    p_branch_id,
    'DRAFT',
    coalesce(p_order_date,current_date),
    p_expected_date,
    greatest(coalesce(p_discount_amount,0),0),
    nullif(trim(p_reference_no),''),
    nullif(trim(p_notes),''),
    auth.uid()
  )
  returning * into po;

  for i in
    select
      (x->>'product_id')::uuid as product_id,
      (x->>'quantity')::numeric as quantity,
      (x->>'unit_cost')::numeric as unit_cost,
      coalesce((x->>'discount_amount')::numeric,0) as discount_amount,
      coalesce((x->>'vat_rate')::numeric,0) as vat_rate
    from jsonb_array_elements(p_items) x
  loop
    if i.quantity <= 0 then
      raise exception 'จำนวนสินค้าต้องมากกว่า 0';
    end if;

    select * into prod
    from public.products
    where id=i.product_id and is_active=true;

    if not found then
      raise exception 'ไม่พบสินค้า';
    end if;

    v_line_subtotal := greatest(
      (i.quantity*i.unit_cost)-i.discount_amount,
      0
    );

    v_line_vat := round(
      v_line_subtotal*(i.vat_rate/100),
      2
    );

    v_line_total := v_line_subtotal+v_line_vat;

    insert into public.purchase_order_items(
      purchase_order_id,
      product_id,
      quantity,
      unit_cost,
      discount_amount,
      vat_rate,
      line_subtotal,
      line_vat,
      line_total,
      product_code_snapshot,
      product_name_snapshot,
      barcode_snapshot
    )
    values(
      po.id,
      prod.id,
      i.quantity,
      i.unit_cost,
      i.discount_amount,
      i.vat_rate,
      v_line_subtotal,
      v_line_vat,
      v_line_total,
      prod.product_code,
      prod.name,
      prod.barcode
    );

    v_subtotal := v_subtotal+v_line_subtotal;
    v_vat := v_vat+v_line_vat;
    v_total := v_total+v_line_total;
  end loop;

  update public.purchase_orders
  set
    subtotal=v_subtotal,
    vat_amount=v_vat,
    grand_total=greatest(v_total-po.discount_amount,0),
    updated_at=now()
  where id=po.id
  returning * into po;

  perform public.write_audit_log(
    'CREATE',
    'PURCHASE_ORDER',
    po.id::text,
    po.po_no,
    jsonb_build_object(
      'supplier_id',po.supplier_id,
      'grand_total',po.grand_total,
      'status',po.status
    ),
    po.branch_id,
    null
  );

  return po;
end;
$$;

create or replace function public.submit_purchase_order(
  p_purchase_order_id uuid
)
returns public.purchase_orders
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  po public.purchase_orders;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;

  update public.purchase_orders
  set
    status='SUBMITTED',
    submitted_by=auth.uid(),
    submitted_at=now(),
    updated_at=now()
  where id=p_purchase_order_id
    and status='DRAFT'
  returning * into po;

  if not found then
    raise exception 'ไม่พบ PO หรือสถานะไม่ถูกต้อง';
  end if;

  return po;
end;
$$;

create or replace function public.approve_purchase_order(
  p_purchase_order_id uuid
)
returns public.purchase_orders
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  po public.purchase_orders;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะ Admin เท่านั้นที่อนุมัติ PO ได้';
  end if;

  update public.purchase_orders
  set
    status='APPROVED',
    approved_by=auth.uid(),
    approved_at=now(),
    updated_at=now()
  where id=p_purchase_order_id
    and status='SUBMITTED'
  returning * into po;

  if not found then
    raise exception 'ไม่พบ PO หรือสถานะไม่ถูกต้อง';
  end if;

  perform public.write_audit_log(
    'UPDATE',
    'PURCHASE_ORDER',
    po.id::text,
    po.po_no,
    jsonb_build_object('status','APPROVED'),
    po.branch_id,
    null
  );

  return po;
end;
$$;

create or replace view public.supplier_list
with (security_invoker=true)
as
select
  s.*,
  count(po.id) as total_purchase_orders,
  coalesce(sum(po.grand_total) filter (
    where po.status <> 'CANCELLED'
  ),0) as total_purchase_value
from public.suppliers s
left join public.purchase_orders po on po.supplier_id=s.id
group by s.id;

create or replace view public.purchase_order_list
with (security_invoker=true)
as
select
  po.id,
  po.po_no,
  po.supplier_id,
  s.supplier_code,
  s.supplier_name,
  po.branch_id,
  b.code as branch_code,
  b.name as branch_name,
  po.status,
  po.order_date,
  po.expected_date,
  po.subtotal,
  po.discount_amount,
  po.vat_amount,
  po.grand_total,
  po.reference_no,
  po.notes,
  po.created_by,
  p.full_name as created_by_name,
  p.email as created_by_email,
  po.created_at,
  po.submitted_at,
  po.approved_at,
  count(poi.id) as total_lines,
  coalesce(sum(poi.quantity),0) as total_quantity,
  coalesce(sum(poi.received_quantity),0) as received_quantity
from public.purchase_orders po
join public.suppliers s on s.id=po.supplier_id
join public.branches b on b.id=po.branch_id
left join public.purchase_order_items poi on poi.purchase_order_id=po.id
left join public.profiles p on p.id=po.created_by
group by po.id,s.supplier_code,s.supplier_name,b.code,b.name,p.full_name,p.email;

create or replace view public.purchase_order_item_list
with (security_invoker=true)
as
select
  poi.id,
  poi.purchase_order_id,
  po.po_no,
  poi.product_id,
  poi.product_code_snapshot as product_code,
  poi.product_name_snapshot as product_name,
  poi.barcode_snapshot as barcode,
  poi.quantity,
  poi.received_quantity,
  greatest(poi.quantity-poi.received_quantity,0) as remaining_quantity,
  poi.unit_cost,
  poi.discount_amount,
  poi.vat_rate,
  poi.line_subtotal,
  poi.line_vat,
  poi.line_total
from public.purchase_order_items poi
join public.purchase_orders po on po.id=poi.purchase_order_id;

alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

drop policy if exists suppliers_read on public.suppliers;
drop policy if exists suppliers_admin_write on public.suppliers;
drop policy if exists purchase_orders_read on public.purchase_orders;
drop policy if exists purchase_order_items_read on public.purchase_order_items;

create policy suppliers_read
on public.suppliers
for select to authenticated
using(public.is_active_user());

create policy suppliers_admin_write
on public.suppliers
for all to authenticated
using(public.is_admin())
with check(public.is_admin());

create policy purchase_orders_read
on public.purchase_orders
for select to authenticated
using(public.is_active_user());

create policy purchase_order_items_read
on public.purchase_order_items
for select to authenticated
using(public.is_active_user());

grant select,insert,update on public.suppliers to authenticated;
grant select on public.purchase_orders,public.purchase_order_items to authenticated;
grant select on public.supplier_list,public.purchase_order_list,
public.purchase_order_item_list to authenticated;

grant execute on function public.generate_next_po_no() to authenticated;
grant execute on function public.create_purchase_order(
  uuid,uuid,jsonb,date,date,numeric,text,text
) to authenticated;
grant execute on function public.submit_purchase_order(uuid) to authenticated;
grant execute on function public.approve_purchase_order(uuid) to authenticated;

revoke all on public.suppliers from anon;
revoke all on public.purchase_orders from anon;
revoke all on public.purchase_order_items from anon;
revoke all on public.supplier_list from anon;
revoke all on public.purchase_order_list from anon;
revoke all on public.purchase_order_item_list from anon;

insert into public.system_migrations(phase,description)
values(
  'PHASE_09_1',
  'ระบบผู้จำหน่ายและใบสั่งซื้อ Purchase Order'
)
on conflict(phase) do update
set description=excluded.description,executed_at=now();

commit;
