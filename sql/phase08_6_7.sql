-- ============================================================
-- PHASE 08.6-8.7
-- POS RECEIPT + SALES RETURN
-- ร้านเถ้าแก่น้อยชลบุรี
-- ต้องรันหลัง Phase 8.5
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.sales') is null then
    raise exception 'ไม่พบ public.sales กรุณารัน Phase 8.1 ก่อน';
  end if;

  if to_regclass('public.sale_items') is null then
    raise exception 'ไม่พบ public.sale_items กรุณารัน Phase 8.1 ก่อน';
  end if;

  if to_regclass('public.branch_inventory') is null then
    raise exception 'ไม่พบ public.branch_inventory กรุณารัน Phase 7.2 ก่อน';
  end if;
end;
$$;

do $$
begin
  create type public.sales_return_status as enum (
    'COMPLETED',
    'VOIDED'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.refund_method as enum (
    'CASH',
    'TRANSFER',
    'QR',
    'CARD',
    'STORE_CREDIT',
    'OTHER'
  );
exception
  when duplicate_object then null;
end;
$$;

-- ------------------------------------------------------------
-- 1. ใบคืนสินค้า
-- ------------------------------------------------------------
create table if not exists public.sales_returns (
  id uuid primary key default extensions.gen_random_uuid(),

  return_no text not null unique,

  sale_id uuid not null
    references public.sales(id)
    on update cascade
    on delete restrict,

  branch_id uuid not null
    references public.branches(id)
    on update cascade
    on delete restrict,

  member_id uuid null
    references public.members(id)
    on update cascade
    on delete set null,

  status public.sales_return_status not null default 'COMPLETED',
  refund_method public.refund_method not null default 'CASH',

  refund_amount numeric(14,2) not null default 0
    check (refund_amount >= 0),

  points_reversed numeric(14,2) not null default 0
    check (points_reversed >= 0),

  reason text not null,
  notes text,

  created_by uuid references auth.users(id) on delete set null,
  voided_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  voided_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_return_items (
  id uuid primary key default extensions.gen_random_uuid(),

  return_id uuid not null
    references public.sales_returns(id)
    on update cascade
    on delete restrict,

  sale_item_id uuid not null
    references public.sale_items(id)
    on update cascade
    on delete restrict,

  product_id uuid not null
    references public.products(id)
    on update cascade
    on delete restrict,

  quantity numeric(14,3) not null
    check (quantity > 0),

  unit_price numeric(14,2) not null
    check (unit_price >= 0),

  refund_amount numeric(14,2) not null
    check (refund_amount >= 0),

  product_code_snapshot text,
  barcode_snapshot text,
  product_name_snapshot text,

  created_at timestamptz not null default now()
);

create index if not exists idx_sales_returns_sale
on public.sales_returns(sale_id, created_at desc);

create index if not exists idx_sales_returns_branch
on public.sales_returns(branch_id, created_at desc);

create index if not exists idx_sales_return_items_return
on public.sales_return_items(return_id);

create index if not exists idx_sales_return_items_sale_item
on public.sales_return_items(sale_item_id);

insert into public.code_sequences(
  sequence_name,
  current_value,
  prefix,
  number_length
)
values(
  'SALES_RETURN',
  0,
  'RT',
  6
)
on conflict(sequence_name) do nothing;

create or replace function public.generate_next_sales_return_no()
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
  where sequence_name='SALES_RETURN'
  for update;

  if not found then
    raise exception 'ไม่พบลำดับ SALES_RETURN';
  end if;

  update public.code_sequences
  set current_value=n,updated_at=now()
  where sequence_name='SALES_RETURN';

  return p||to_char(current_date,'YYYYMMDD')||'-'||lpad(n::text,l,'0');
end;
$$;

-- ------------------------------------------------------------
-- 2. View จำนวนที่คืนแล้วต่อรายการขาย
-- ------------------------------------------------------------
create or replace view public.sale_item_return_balance
with (security_invoker=true)
as
select
  si.id as sale_item_id,
  si.sale_id,
  si.product_id,
  si.product_code_snapshot as product_code,
  si.barcode_snapshot as barcode,
  si.product_name_snapshot as product_name,
  si.quantity as sold_quantity,
  si.unit_price,
  si.line_total,

  coalesce(
    sum(sri.quantity) filter (
      where sr.status='COMPLETED'
    ),
    0
  ) as returned_quantity,

  greatest(
    si.quantity -
    coalesce(
      sum(sri.quantity) filter (
        where sr.status='COMPLETED'
      ),
      0
    ),
    0
  ) as returnable_quantity

from public.sale_items si
left join public.sales_return_items sri
  on sri.sale_item_id=si.id
left join public.sales_returns sr
  on sr.id=sri.return_id
group by si.id;

-- ------------------------------------------------------------
-- 3. คืนสินค้า
-- p_items:
-- [{"sale_item_id":"UUID","quantity":1}]
-- ------------------------------------------------------------
create or replace function public.create_sales_return(
  p_sale_id uuid,
  p_items jsonb,
  p_refund_method text default 'CASH',
  p_reason text default null,
  p_notes text default null
)
returns public.sales_returns
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_sale public.sales;
  v_return public.sales_returns;
  v_method public.refund_method;

  i record;
  v_balance record;
  v_qty numeric(14,3);
  v_refund numeric(14,2);
  v_total_refund numeric(14,2) := 0;

  v_member public.members;
  v_points_to_reverse numeric(14,2) := 0;
  v_before numeric(14,2);
  v_after numeric(14,2);
begin
  if not public.is_admin() then
    raise exception 'เฉพาะ Admin เท่านั้นที่คืนสินค้าได้';
  end if;

  if nullif(trim(p_reason),'') is null then
    raise exception 'กรุณาระบุเหตุผลการคืนสินค้า';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items)=0 then
    raise exception 'กรุณาเลือกรายการคืนอย่างน้อย 1 รายการ';
  end if;

  begin
    v_method := upper(trim(p_refund_method))::public.refund_method;
  exception
    when invalid_text_representation then
      raise exception 'วิธีคืนเงินไม่ถูกต้อง';
  end;

  select *
  into v_sale
  from public.sales
  where id=p_sale_id
  for update;

  if not found then
    raise exception 'ไม่พบบิลขาย';
  end if;

  if v_sale.status <> 'COMPLETED' then
    raise exception 'บิลนี้ถูกยกเลิกหรือไม่สามารถคืนสินค้าได้';
  end if;

  insert into public.sales_returns(
    return_no,
    sale_id,
    branch_id,
    member_id,
    status,
    refund_method,
    refund_amount,
    points_reversed,
    reason,
    notes,
    created_by
  )
  values(
    public.generate_next_sales_return_no(),
    v_sale.id,
    v_sale.branch_id,
    v_sale.member_id,
    'COMPLETED',
    v_method,
    0,
    0,
    trim(p_reason),
    nullif(trim(p_notes),''),
    auth.uid()
  )
  returning * into v_return;

  for i in
    select
      (item->>'sale_item_id')::uuid as sale_item_id,
      sum((item->>'quantity')::numeric) as quantity
    from jsonb_array_elements(p_items) item
    group by (item->>'sale_item_id')::uuid
    order by (item->>'sale_item_id')::uuid
  loop
    v_qty := i.quantity;

    if v_qty <= 0 then
      raise exception 'จำนวนคืนต้องมากกว่า 0';
    end if;

    select *
    into v_balance
    from public.sale_item_return_balance
    where sale_item_id=i.sale_item_id
      and sale_id=v_sale.id;

    if not found then
      raise exception 'ไม่พบรายการขาย';
    end if;

    if v_qty > v_balance.returnable_quantity then
      raise exception
      'คืนสินค้า % เกินจำนวนที่คืนได้ คงเหลือคืนได้ %',
      v_balance.product_code,
      v_balance.returnable_quantity;
    end if;

    v_refund := round(
      (v_balance.line_total / nullif(v_balance.sold_quantity,0)) * v_qty,
      2
    );

    insert into public.sales_return_items(
      return_id,
      sale_item_id,
      product_id,
      quantity,
      unit_price,
      refund_amount,
      product_code_snapshot,
      barcode_snapshot,
      product_name_snapshot
    )
    values(
      v_return.id,
      v_balance.sale_item_id,
      v_balance.product_id,
      v_qty,
      v_balance.unit_price,
      v_refund,
      v_balance.product_code,
      v_balance.barcode,
      v_balance.product_name
    );

    insert into public.branch_inventory(
      branch_id,
      product_id,
      quantity,
      minimum_stock
    )
    values(
      v_sale.branch_id,
      v_balance.product_id,
      v_qty,
      0
    )
    on conflict(branch_id,product_id) do update
    set
      quantity=public.branch_inventory.quantity+excluded.quantity,
      updated_at=now();

    v_total_refund := v_total_refund + v_refund;
  end loop;

  -- คืนคะแนนที่เคยได้รับตามสัดส่วนยอดคืน
  if v_sale.member_id is not null
     and coalesce(v_sale.points_earned,0) > 0
     and v_sale.net_total > 0 then

    v_points_to_reverse := least(
      v_sale.points_earned,
      floor(
        v_sale.points_earned *
        (v_total_refund / nullif(v_sale.net_total,0))
      )
    );

    select *
    into v_member
    from public.members
    where id=v_sale.member_id
    for update;

    if found and v_points_to_reverse > 0 then
      v_before := v_member.points_balance;
      v_after := greatest(v_before-v_points_to_reverse,0);

      update public.members
      set
        points_balance=v_after,
        total_spent=greatest(total_spent-v_total_refund,0),
        updated_at=now()
      where id=v_member.id;

      insert into public.member_point_transactions(
        member_id,
        sale_id,
        transaction_type,
        points_change,
        points_before,
        points_after,
        description,
        created_by
      )
      values(
        v_member.id,
        v_sale.id,
        'ADJUST',
        -least(v_points_to_reverse,v_before),
        v_before,
        v_after,
        'ปรับคืนคะแนนจากใบคืน '||v_return.return_no,
        auth.uid()
      );
    end if;
  end if;

  update public.sales_returns
  set
    refund_amount=v_total_refund,
    points_reversed=least(v_points_to_reverse,coalesce(v_before,0)),
    updated_at=now()
  where id=v_return.id
  returning * into v_return;

  perform public.write_audit_log(
    'CREATE',
    'SALES_RETURN',
    v_return.id::text,
    v_return.return_no,
    jsonb_build_object(
      'sale_no',v_sale.sale_no,
      'refund_amount',v_return.refund_amount,
      'reason',v_return.reason
    ),
    v_return.branch_id,
    null
  );

  return v_return;
end;
$$;

-- ------------------------------------------------------------
-- 4. View ใบเสร็จ
-- ------------------------------------------------------------
create or replace view public.pos_receipt_header
with (security_invoker=true)
as
select
  s.id,
  s.sale_no,
  s.branch_id,
  b.code as branch_code,
  b.name as branch_name,
  b.address as branch_address,
  b.phone as branch_phone,

  s.status,
  s.subtotal,
  s.discount_amount,
  s.net_total,
  s.payment_method,
  s.received_amount,
  s.change_amount,

  s.customer_name,
  s.customer_phone,

  s.member_id,
  m.member_no,
  m.full_name as member_name,
  m.phone as member_phone,
  s.points_earned,
  s.points_redeemed,

  s.notes,
  s.created_at,

  p.full_name as cashier_name,
  p.email as cashier_email

from public.sales s
join public.branches b on b.id=s.branch_id
left join public.members m on m.id=s.member_id
left join public.profiles p on p.id=s.created_by;

create or replace view public.pos_receipt_items
with (security_invoker=true)
as
select
  si.id,
  si.sale_id,
  si.product_id,
  si.product_code_snapshot as product_code,
  si.barcode_snapshot as barcode,
  si.product_name_snapshot as product_name,
  si.quantity,
  si.unit_price,
  si.discount_amount,
  si.line_total
from public.sale_items si;

create or replace view public.sales_return_list
with (security_invoker=true)
as
select
  sr.id,
  sr.return_no,
  sr.sale_id,
  s.sale_no,
  sr.branch_id,
  b.code as branch_code,
  b.name as branch_name,
  sr.member_id,
  m.member_no,
  m.full_name as member_name,
  sr.status,
  sr.refund_method,
  sr.refund_amount,
  sr.points_reversed,
  sr.reason,
  sr.notes,
  sr.created_at,
  p.full_name as created_by_name,
  p.email as created_by_email,
  count(sri.id) as total_lines,
  coalesce(sum(sri.quantity),0) as total_quantity
from public.sales_returns sr
join public.sales s on s.id=sr.sale_id
join public.branches b on b.id=sr.branch_id
left join public.members m on m.id=sr.member_id
left join public.sales_return_items sri on sri.return_id=sr.id
left join public.profiles p on p.id=sr.created_by
group by sr.id,s.sale_no,b.code,b.name,m.member_no,m.full_name,p.full_name,p.email;

create or replace view public.sales_return_item_list
with (security_invoker=true)
as
select
  sri.id,
  sri.return_id,
  sr.return_no,
  sr.sale_id,
  s.sale_no,
  sri.sale_item_id,
  sri.product_id,
  sri.product_code_snapshot as product_code,
  sri.barcode_snapshot as barcode,
  sri.product_name_snapshot as product_name,
  sri.quantity,
  sri.unit_price,
  sri.refund_amount
from public.sales_return_items sri
join public.sales_returns sr on sr.id=sri.return_id
join public.sales s on s.id=sr.sale_id;

-- ------------------------------------------------------------
-- 5. RLS
-- ------------------------------------------------------------
alter table public.sales_returns enable row level security;
alter table public.sales_return_items enable row level security;

drop policy if exists sales_returns_read on public.sales_returns;
drop policy if exists sales_return_items_read on public.sales_return_items;

create policy sales_returns_read
on public.sales_returns
for select to authenticated
using(public.is_active_user());

create policy sales_return_items_read
on public.sales_return_items
for select to authenticated
using(public.is_active_user());

grant select on public.sales_returns,
public.sales_return_items,
public.sale_item_return_balance,
public.pos_receipt_header,
public.pos_receipt_items,
public.sales_return_list,
public.sales_return_item_list
to authenticated;

grant execute on function public.generate_next_sales_return_no()
to authenticated;

grant execute on function public.create_sales_return(
  uuid,jsonb,text,text,text
) to authenticated;

revoke all on public.sales_returns from anon;
revoke all on public.sales_return_items from anon;
revoke all on public.sale_item_return_balance from anon;
revoke all on public.pos_receipt_header from anon;
revoke all on public.pos_receipt_items from anon;
revoke all on public.sales_return_list from anon;
revoke all on public.sales_return_item_list from anon;

insert into public.system_migrations(phase,description)
values(
  'PHASE_08_6_7',
  'ใบเสร็จ POS 58/80 มม. A4 PeriPage และระบบคืนสินค้า คืนสต๊อก ปรับคะแนน'
)
on conflict(phase) do update
set
  description=excluded.description,
  executed_at=now();

commit;
