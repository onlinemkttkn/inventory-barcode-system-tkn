-- ============================================================
-- PHASE 07.3
-- ระบบตรวจนับสต๊อกด้วยมือถือ ร้านเถ้าแก่น้อยชลบุรี
-- ต้องรันหลัง Phase 7.2
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
  create type public.stock_count_status as enum (
    'DRAFT',
    'COUNTING',
    'COMPLETED',
    'CANCELLED'
  );
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.stock_count_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  count_no text not null unique,
  branch_id uuid not null
    references public.branches(id)
    on update cascade
    on delete restrict,
  status public.stock_count_status not null default 'COUNTING',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_count_items (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null
    references public.stock_count_sessions(id)
    on update cascade
    on delete restrict,
  product_id uuid not null
    references public.products(id)
    on update cascade
    on delete restrict,
  system_quantity numeric(14,3) not null default 0,
  counted_quantity numeric(14,3) not null default 0
    check (counted_quantity >= 0),
  variance numeric(14,3) generated always as
    (counted_quantity - system_quantity) stored,
  note text,
  counted_by uuid references auth.users(id) on delete set null,
  counted_at timestamptz not null default now(),
  unique(session_id, product_id)
);

insert into public.code_sequences(sequence_name,current_value,prefix,number_length)
values ('STOCK_COUNT',0,'SC',6)
on conflict(sequence_name) do nothing;

create or replace function public.generate_next_stock_count_no()
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
  where sequence_name='STOCK_COUNT'
  for update;

  update public.code_sequences
  set current_value=n,updated_at=now()
  where sequence_name='STOCK_COUNT';

  return p||to_char(current_date,'YYYYMMDD')||'-'||lpad(n::text,l,'0');
end;
$$;

create or replace function public.create_stock_count_session(
  p_branch_id uuid,
  p_notes text default null
)
returns public.stock_count_sessions
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  s public.stock_count_sessions;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;

  insert into public.stock_count_sessions(
    count_no,branch_id,status,notes,created_by
  )
  values(
    public.generate_next_stock_count_no(),
    p_branch_id,
    'COUNTING',
    nullif(trim(p_notes),''),
    auth.uid()
  )
  returning * into s;

  return s;
end;
$$;

create or replace function public.save_stock_count_item(
  p_session_id uuid,
  p_product_id uuid,
  p_counted_quantity numeric,
  p_note text default null
)
returns public.stock_count_items
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  s public.stock_count_sessions;
  q numeric(14,3);
  item public.stock_count_items;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;

  if p_counted_quantity < 0 then
    raise exception 'จำนวนที่นับต้องไม่น้อยกว่า 0';
  end if;

  select * into s
  from public.stock_count_sessions
  where id=p_session_id
  for update;

  if not found then
    raise exception 'ไม่พบรอบตรวจนับ';
  end if;

  if s.status <> 'COUNTING' then
    raise exception 'รอบตรวจนับนี้ปิดแล้ว';
  end if;

  select quantity into q
  from public.branch_inventory
  where branch_id=s.branch_id
    and product_id=p_product_id;

  if q is null then
    q := 0;
  end if;

  insert into public.stock_count_items(
    session_id,product_id,system_quantity,counted_quantity,
    note,counted_by,counted_at
  )
  values(
    p_session_id,p_product_id,q,p_counted_quantity,
    nullif(trim(p_note),''),auth.uid(),now()
  )
  on conflict(session_id,product_id) do update
  set
    system_quantity=excluded.system_quantity,
    counted_quantity=excluded.counted_quantity,
    note=excluded.note,
    counted_by=auth.uid(),
    counted_at=now()
  returning * into item;

  return item;
end;
$$;

create or replace function public.complete_stock_count_session(
  p_session_id uuid
)
returns public.stock_count_sessions
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  s public.stock_count_sessions;
  i record;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;

  select * into s
  from public.stock_count_sessions
  where id=p_session_id
  for update;

  if not found then
    raise exception 'ไม่พบรอบตรวจนับ';
  end if;

  if s.status <> 'COUNTING' then
    raise exception 'รอบตรวจนับนี้ไม่อยู่ในสถานะกำลังนับ';
  end if;

  if not exists(
    select 1 from public.stock_count_items
    where session_id=p_session_id
  ) then
    raise exception 'ยังไม่มีรายการที่นับ';
  end if;

  for i in
    select *
    from public.stock_count_items
    where session_id=p_session_id
    order by product_id
  loop
    insert into public.branch_inventory(
      branch_id,product_id,quantity,minimum_stock
    )
    values(
      s.branch_id,i.product_id,i.counted_quantity,0
    )
    on conflict(branch_id,product_id) do update
    set
      quantity=excluded.quantity,
      updated_at=now();
  end loop;

  update public.stock_count_sessions
  set
    status='COMPLETED',
    completed_by=auth.uid(),
    completed_at=now(),
    updated_at=now()
  where id=p_session_id
  returning * into s;

  return s;
end;
$$;

create or replace view public.stock_count_session_list
with (security_invoker=true)
as
select
  s.id,
  s.count_no,
  s.branch_id,
  b.code as branch_code,
  b.name as branch_name,
  s.status,
  s.notes,
  s.created_by,
  creator.full_name as created_by_name,
  s.completed_by,
  completer.full_name as completed_by_name,
  s.created_at,
  s.completed_at,
  count(i.id) as total_lines,
  coalesce(sum(abs(i.variance)),0) as total_variance
from public.stock_count_sessions s
join public.branches b on b.id=s.branch_id
left join public.stock_count_items i on i.session_id=s.id
left join public.profiles creator on creator.id=s.created_by
left join public.profiles completer on completer.id=s.completed_by
group by s.id,b.code,b.name,creator.full_name,completer.full_name;

create or replace view public.stock_count_item_list
with (security_invoker=true)
as
select
  i.id,
  i.session_id,
  s.count_no,
  s.branch_id,
  b.name as branch_name,
  i.product_id,
  p.product_code,
  p.barcode,
  p.name as product_name,
  u.name as unit_name,
  i.system_quantity,
  i.counted_quantity,
  i.variance,
  i.note,
  i.counted_at
from public.stock_count_items i
join public.stock_count_sessions s on s.id=i.session_id
join public.branches b on b.id=s.branch_id
join public.products p on p.id=i.product_id
left join public.units u on u.id=p.unit_id;

alter table public.stock_count_sessions enable row level security;
alter table public.stock_count_items enable row level security;

drop policy if exists stock_count_sessions_read on public.stock_count_sessions;
drop policy if exists stock_count_items_read on public.stock_count_items;

create policy stock_count_sessions_read
on public.stock_count_sessions
for select to authenticated
using(public.is_active_user());

create policy stock_count_items_read
on public.stock_count_items
for select to authenticated
using(public.is_active_user());

grant select on public.stock_count_sessions,
public.stock_count_items,
public.stock_count_session_list,
public.stock_count_item_list
to authenticated;

grant execute on function public.generate_next_stock_count_no() to authenticated;
grant execute on function public.create_stock_count_session(uuid,text) to authenticated;
grant execute on function public.save_stock_count_item(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.complete_stock_count_session(uuid) to authenticated;

revoke all on public.stock_count_sessions from anon;
revoke all on public.stock_count_items from anon;
revoke all on public.stock_count_session_list from anon;
revoke all on public.stock_count_item_list from anon;

insert into public.system_migrations(phase,description)
values(
  'PHASE_07_3',
  'ระบบตรวจนับสต๊อกด้วยมือถือและปรับยอดตามสาขา'
)
on conflict(phase) do update
set description=excluded.description,executed_at=now();

commit;
