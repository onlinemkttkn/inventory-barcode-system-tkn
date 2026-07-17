-- ============================================================
-- PHASE 08.1
-- POS ขายหน้าร้าน ร้านเถ้าแก่น้อยชลบุรี
-- ต้องรันหลัง Phase 7.5
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.branches') is null then
    raise exception 'ไม่พบ public.branches กรุณารัน Phase 7.2 ก่อน';
  end if;
  if to_regclass('public.branch_inventory') is null then
    raise exception 'ไม่พบ public.branch_inventory กรุณารัน Phase 7.2 ก่อน';
  end if;
end;
$$;

do $$
begin
  create type public.sale_status as enum (
    'COMPLETED',
    'VOIDED'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_method as enum (
    'CASH',
    'TRANSFER',
    'QR',
    'CARD',
    'OTHER'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.sales (
  id uuid primary key default extensions.gen_random_uuid(),
  sale_no text not null unique,

  branch_id uuid not null
    references public.branches(id)
    on update cascade
    on delete restrict,

  status public.sale_status not null default 'COMPLETED',

  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  net_total numeric(14,2) not null default 0 check (net_total >= 0),

  payment_method public.payment_method not null,
  received_amount numeric(14,2) not null default 0 check (received_amount >= 0),
  change_amount numeric(14,2) not null default 0 check (change_amount >= 0),

  customer_name text,
  customer_phone text,
  notes text,

  created_by uuid references auth.users(id) on delete set null,
  voided_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  voided_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default extensions.gen_random_uuid(),

  sale_id uuid not null
    references public.sales(id)
    on update cascade
    on delete restrict,

  product_id uuid not null
    references public.products(id)
    on update cascade
    on delete restrict,

  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),

  product_code_snapshot text,
  barcode_snapshot text,
  product_name_snapshot text,

  created_at timestamptz not null default now()
);

create index if not exists idx_sales_branch_created
on public.sales(branch_id, created_at desc);

create index if not exists idx_sales_status
on public.sales(status);

create index if not exists idx_sale_items_sale
on public.sale_items(sale_id);

create index if not exists idx_sale_items_product
on public.sale_items(product_id);

insert into public.code_sequences(
  sequence_name,current_value,prefix,number_length
)
values(
  'SALE_DOCUMENT',0,'SL',6
)
on conflict(sequence_name) do nothing;

create or replace function public.generate_next_sale_no()
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
  where sequence_name='SALE_DOCUMENT'
  for update;

  if not found then
    raise exception 'ไม่พบลำดับ SALE_DOCUMENT';
  end if;

  update public.code_sequences
  set current_value=n,updated_at=now()
  where sequence_name='SALE_DOCUMENT';

  return p||to_char(current_date,'YYYYMMDD')||'-'||lpad(n::text,l,'0');
end;
$$;

create or replace function public.create_pos_sale(
  p_branch_id uuid,
  p_items jsonb,
  p_discount_amount numeric default 0,
  p_payment_method text default 'CASH',
  p_received_amount numeric default 0,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_notes text default null
)
returns public.sales
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_sale public.sales;
  v_payment public.payment_method;
  v_subtotal numeric(14,2) := 0;
  v_net_total numeric(14,2) := 0;
  v_change numeric(14,2) := 0;

  i record;
  v_product public.products;
  v_stock numeric(14,3);
  v_qty numeric(14,3);
  v_price numeric(14,2);
  v_line_discount numeric(14,2);
  v_line_total numeric(14,2);
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;

  if p_branch_id is null then
    raise exception 'กรุณาเลือกสาขา';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items)=0 then
    raise exception 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ';
  end if;

  begin
    v_payment := upper(trim(p_payment_method))::public.payment_method;
  exception when invalid_text_representation then
    raise exception 'วิธีชำระเงินไม่ถูกต้อง';
  end;

  if coalesce(p_discount_amount,0) < 0 then
    raise exception 'ส่วนลดต้องไม่น้อยกว่า 0';
  end if;

  -- ตรวจและคำนวณยอด
  for i in
    select
      (x->>'product_id')::uuid as product_id,
      sum((x->>'quantity')::numeric) as quantity,
      max((x->>'unit_price')::numeric) as unit_price,
      sum(coalesce((x->>'discount_amount')::numeric,0)) as discount_amount
    from jsonb_array_elements(p_items) x
    group by (x->>'product_id')::uuid
    order by (x->>'product_id')::uuid
  loop
    v_qty := i.quantity;
    v_price := i.unit_price;
    v_line_discount := i.discount_amount;

    if v_qty <= 0 then
      raise exception 'จำนวนสินค้าต้องมากกว่า 0';
    end if;

    if v_price < 0 then
      raise exception 'ราคาสินค้าต้องไม่น้อยกว่า 0';
    end if;

    select *
    into v_product
    from public.products
    where id=i.product_id
      and is_active=true;

    if not found then
      raise exception 'ไม่พบสินค้า ID %', i.product_id;
    end if;

    select quantity
    into v_stock
    from public.branch_inventory
    where branch_id=p_branch_id
      and product_id=i.product_id
    for update;

    if v_stock is null or v_stock < v_qty then
      raise exception
      'สินค้า % คงเหลือไม่พอ มี % ต้องการ %',
      v_product.product_code,
      coalesce(v_stock,0),
      v_qty;
    end if;

    v_line_total := greatest((v_qty*v_price)-v_line_discount,0);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  v_net_total := greatest(v_subtotal-coalesce(p_discount_amount,0),0);

  if v_payment='CASH' and coalesce(p_received_amount,0) < v_net_total then
    raise exception 'จำนวนเงินรับน้อยกว่ายอดสุทธิ';
  end if;

  if v_payment='CASH' then
    v_change := greatest(coalesce(p_received_amount,0)-v_net_total,0);
  else
    v_change := 0;
  end if;

  insert into public.sales(
    sale_no,
    branch_id,
    status,
    subtotal,
    discount_amount,
    net_total,
    payment_method,
    received_amount,
    change_amount,
    customer_name,
    customer_phone,
    notes,
    created_by
  )
  values(
    public.generate_next_sale_no(),
    p_branch_id,
    'COMPLETED',
    v_subtotal,
    coalesce(p_discount_amount,0),
    v_net_total,
    v_payment,
    case
      when v_payment='CASH' then coalesce(p_received_amount,0)
      else v_net_total
    end,
    v_change,
    nullif(trim(p_customer_name),''),
    nullif(trim(p_customer_phone),''),
    nullif(trim(p_notes),''),
    auth.uid()
  )
  returning * into v_sale;

  -- บันทึกรายการและตัดสต๊อก
  for i in
    select
      (x->>'product_id')::uuid as product_id,
      sum((x->>'quantity')::numeric) as quantity,
      max((x->>'unit_price')::numeric) as unit_price,
      sum(coalesce((x->>'discount_amount')::numeric,0)) as discount_amount
    from jsonb_array_elements(p_items) x
    group by (x->>'product_id')::uuid
    order by (x->>'product_id')::uuid
  loop
    v_qty := i.quantity;
    v_price := i.unit_price;
    v_line_discount := i.discount_amount;
    v_line_total := greatest((v_qty*v_price)-v_line_discount,0);

    select *
    into v_product
    from public.products
    where id=i.product_id;

    update public.branch_inventory
    set
      quantity=quantity-v_qty,
      updated_at=now()
    where branch_id=p_branch_id
      and product_id=i.product_id;

    insert into public.sale_items(
      sale_id,
      product_id,
      quantity,
      unit_price,
      discount_amount,
      line_total,
      product_code_snapshot,
      barcode_snapshot,
      product_name_snapshot
    )
    values(
      v_sale.id,
      i.product_id,
      v_qty,
      v_price,
      v_line_discount,
      v_line_total,
      v_product.product_code,
      v_product.barcode,
      v_product.name
    );
  end loop;

  perform public.write_audit_log(
    'CREATE',
    'SALE',
    v_sale.id::text,
    v_sale.sale_no,
    jsonb_build_object(
      'branch_id',v_sale.branch_id,
      'net_total',v_sale.net_total,
      'payment_method',v_sale.payment_method
    ),
    v_sale.branch_id,
    null
  );

  return v_sale;
end;
$$;

create or replace function public.void_pos_sale(
  p_sale_id uuid,
  p_reason text
)
returns public.sales
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_sale public.sales;
  i record;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะ Admin เท่านั้นที่ยกเลิกการขายได้';
  end if;

  if nullif(trim(p_reason),'') is null then
    raise exception 'กรุณาระบุเหตุผล';
  end if;

  select *
  into v_sale
  from public.sales
  where id=p_sale_id
  for update;

  if not found then
    raise exception 'ไม่พบรายการขาย';
  end if;

  if v_sale.status='VOIDED' then
    raise exception 'รายการนี้ถูกยกเลิกแล้ว';
  end if;

  for i in
    select *
    from public.sale_items
    where sale_id=v_sale.id
    order by product_id
  loop
    insert into public.branch_inventory(
      branch_id,product_id,quantity,minimum_stock
    )
    values(
      v_sale.branch_id,i.product_id,i.quantity,0
    )
    on conflict(branch_id,product_id) do update
    set quantity=public.branch_inventory.quantity+excluded.quantity,
        updated_at=now();
  end loop;

  update public.sales
  set
    status='VOIDED',
    voided_by=auth.uid(),
    voided_at=now(),
    notes=concat_ws(E'\n',notes,'ยกเลิก: '||trim(p_reason)),
    updated_at=now()
  where id=v_sale.id
  returning * into v_sale;

  perform public.write_audit_log(
    'UPDATE',
    'SALE',
    v_sale.id::text,
    v_sale.sale_no,
    jsonb_build_object(
      'status','VOIDED',
      'reason',trim(p_reason)
    ),
    v_sale.branch_id,
    null
  );

  return v_sale;
end;
$$;

create or replace view public.sale_list
with (security_invoker=true)
as
select
  s.id,
  s.sale_no,
  s.branch_id,
  b.code as branch_code,
  b.name as branch_name,
  s.status,
  s.subtotal,
  s.discount_amount,
  s.net_total,
  s.payment_method,
  s.received_amount,
  s.change_amount,
  s.customer_name,
  s.customer_phone,
  s.notes,
  s.created_by,
  p.full_name as created_by_name,
  p.email as created_by_email,
  s.created_at,
  s.voided_at,
  count(si.id) as total_lines,
  coalesce(sum(si.quantity),0) as total_quantity
from public.sales s
join public.branches b on b.id=s.branch_id
left join public.sale_items si on si.sale_id=s.id
left join public.profiles p on p.id=s.created_by
group by s.id,b.code,b.name,p.full_name,p.email;

create or replace view public.sale_item_list
with (security_invoker=true)
as
select
  si.id,
  si.sale_id,
  s.sale_no,
  s.branch_id,
  si.product_id,
  si.product_code_snapshot as product_code,
  si.barcode_snapshot as barcode,
  si.product_name_snapshot as product_name,
  si.quantity,
  si.unit_price,
  si.discount_amount,
  si.line_total
from public.sale_items si
join public.sales s on s.id=si.sale_id;

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

drop policy if exists sales_read on public.sales;
drop policy if exists sale_items_read on public.sale_items;

create policy sales_read
on public.sales
for select to authenticated
using(public.is_active_user());

create policy sale_items_read
on public.sale_items
for select to authenticated
using(public.is_active_user());

grant select on public.sales,public.sale_items,
public.sale_list,public.sale_item_list
to authenticated;

grant execute on function public.create_pos_sale(
  uuid,jsonb,numeric,text,numeric,text,text,text
) to authenticated;

grant execute on function public.void_pos_sale(uuid,text)
to authenticated;

revoke all on public.sales from anon;
revoke all on public.sale_items from anon;
revoke all on public.sale_list from anon;
revoke all on public.sale_item_list from anon;

insert into public.system_migrations(phase,description)
values(
  'PHASE_08_1',
  'ระบบ POS ขายหน้าร้าน ตัดสต๊อกแยกสาขา และประวัติการขาย'
)
on conflict(phase) do update
set description=excluded.description,executed_at=now();

commit;
