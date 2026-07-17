-- ============================================================
-- PHASE 08.3
-- ระบบสมาชิกและคะแนนสะสม ร้านเถ้าแก่น้อยชลบุรี
-- ต้องรันหลัง Phase 8.1
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.sales') is null then
    raise exception 'ไม่พบ public.sales กรุณารัน Phase 8.1 ก่อน';
  end if;
end;
$$;

create table if not exists public.members (
  id uuid primary key default extensions.gen_random_uuid(),
  member_no text not null unique,
  phone text not null unique,
  full_name text not null,
  email text,
  birthday date,
  address text,
  branch_id uuid null references public.branches(id) on delete set null,
  points_balance numeric(14,2) not null default 0 check (points_balance >= 0),
  total_spent numeric(14,2) not null default 0 check (total_spent >= 0),
  total_visits integer not null default 0 check (total_visits >= 0),
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_members_phone on public.members(phone);
create index if not exists idx_members_name on public.members(lower(full_name));
create index if not exists idx_members_member_no on public.members(member_no);

drop trigger if exists trg_members_updated_at on public.members;
create trigger trg_members_updated_at
before update on public.members
for each row execute function public.set_updated_at();

create table if not exists public.member_point_transactions (
  id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  sale_id uuid null references public.sales(id) on delete set null,
  transaction_type text not null
    check (transaction_type in ('EARN','REDEEM','ADJUST','EXPIRE')),
  points_change numeric(14,2) not null,
  points_before numeric(14,2) not null,
  points_after numeric(14,2) not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_member_points_member
on public.member_point_transactions(member_id, created_at desc);

create table if not exists public.membership_settings (
  id uuid primary key default extensions.gen_random_uuid(),
  branch_id uuid null references public.branches(id) on delete cascade,
  earn_amount_per_point numeric(14,2) not null default 100
    check (earn_amount_per_point > 0),
  point_value numeric(14,2) not null default 1
    check (point_value > 0),
  minimum_redeem_points numeric(14,2) not null default 1
    check (minimum_redeem_points >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(branch_id)
);

insert into public.membership_settings(
  branch_id,earn_amount_per_point,point_value,minimum_redeem_points,is_active
)
values(null,100,1,1,true)
on conflict(branch_id) do nothing;

insert into public.code_sequences(
  sequence_name,current_value,prefix,number_length
)
values('MEMBER_NO',0,'MB',6)
on conflict(sequence_name) do nothing;

create or replace function public.generate_next_member_no()
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
  where sequence_name='MEMBER_NO'
  for update;

  if not found then
    raise exception 'ไม่พบลำดับ MEMBER_NO';
  end if;

  update public.code_sequences
  set current_value=n,updated_at=now()
  where sequence_name='MEMBER_NO';

  return p||lpad(n::text,l,'0');
end;
$$;

create or replace function public.create_member(
  p_phone text,
  p_full_name text,
  p_email text default null,
  p_birthday date default null,
  p_address text default null,
  p_branch_id uuid default null,
  p_notes text default null
)
returns public.members
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  m public.members;
  v_phone text;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;

  v_phone := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');

  if length(v_phone) < 9 then
    raise exception 'เบอร์โทรไม่ถูกต้อง';
  end if;

  if nullif(trim(p_full_name),'') is null then
    raise exception 'กรุณาระบุชื่อสมาชิก';
  end if;

  insert into public.members(
    member_no,phone,full_name,email,birthday,address,
    branch_id,notes,created_by
  )
  values(
    public.generate_next_member_no(),
    v_phone,
    trim(p_full_name),
    nullif(trim(p_email),''),
    p_birthday,
    nullif(trim(p_address),''),
    p_branch_id,
    nullif(trim(p_notes),''),
    auth.uid()
  )
  returning * into m;

  perform public.write_audit_log(
    'CREATE','MEMBER',m.id::text,m.member_no,
    jsonb_build_object('phone',m.phone,'full_name',m.full_name),
    m.branch_id,null
  );

  return m;
end;
$$;

alter table public.sales
  add column if not exists member_id uuid null
    references public.members(id) on delete set null,
  add column if not exists points_earned numeric(14,2) not null default 0,
  add column if not exists points_redeemed numeric(14,2) not null default 0;

create or replace function public.apply_member_to_sale(
  p_sale_id uuid,
  p_member_id uuid,
  p_points_to_redeem numeric default 0
)
returns public.sales
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  s public.sales;
  m public.members;
  cfg public.membership_settings;
  v_redeem numeric(14,2);
  v_discount numeric(14,2);
  v_earn numeric(14,2);
  v_before numeric(14,2);
  v_after numeric(14,2);
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;

  select * into s from public.sales where id=p_sale_id for update;
  if not found then raise exception 'ไม่พบรายการขาย'; end if;
  if s.status <> 'COMPLETED' then raise exception 'บิลนี้ไม่สามารถใช้สมาชิกได้'; end if;
  if s.member_id is not null then raise exception 'บิลนี้ผูกสมาชิกแล้ว'; end if;

  select * into m from public.members
  where id=p_member_id and is_active=true
  for update;

  if not found then raise exception 'ไม่พบสมาชิกหรือสมาชิกถูกปิดใช้งาน'; end if;

  select * into cfg
  from public.membership_settings
  where branch_id=s.branch_id and is_active=true
  limit 1;

  if not found then
    select * into cfg
    from public.membership_settings
    where branch_id is null and is_active=true
    limit 1;
  end if;

  if not found then raise exception 'ไม่พบการตั้งค่าระบบสมาชิก'; end if;

  v_redeem := greatest(coalesce(p_points_to_redeem,0),0);

  if v_redeem > m.points_balance then
    raise exception 'คะแนนไม่เพียงพอ';
  end if;

  if v_redeem > 0 and v_redeem < cfg.minimum_redeem_points then
    raise exception 'คะแนนที่ใช้ต่ำกว่าขั้นต่ำ';
  end if;

  v_discount := least(v_redeem*cfg.point_value,s.net_total);
  v_earn := floor((s.net_total-v_discount)/cfg.earn_amount_per_point);

  v_before := m.points_balance;
  v_after := v_before-v_redeem+v_earn;

  update public.sales
  set
    member_id=m.id,
    points_redeemed=v_redeem,
    points_earned=v_earn,
    discount_amount=discount_amount+v_discount,
    net_total=greatest(net_total-v_discount,0),
    change_amount=case
      when payment_method='CASH'
      then greatest(received_amount-greatest(net_total-v_discount,0),0)
      else 0
    end,
    updated_at=now()
  where id=s.id
  returning * into s;

  update public.members
  set
    points_balance=v_after,
    total_spent=total_spent+s.net_total,
    total_visits=total_visits+1,
    updated_at=now()
  where id=m.id;

  if v_redeem > 0 then
    insert into public.member_point_transactions(
      member_id,sale_id,transaction_type,points_change,
      points_before,points_after,description,created_by
    )
    values(
      m.id,s.id,'REDEEM',-v_redeem,
      v_before,v_before-v_redeem,
      'ใช้คะแนนกับบิล '||s.sale_no,
      auth.uid()
    );
  end if;

  if v_earn > 0 then
    insert into public.member_point_transactions(
      member_id,sale_id,transaction_type,points_change,
      points_before,points_after,description,created_by
    )
    values(
      m.id,s.id,'EARN',v_earn,
      v_before-v_redeem,v_after,
      'สะสมคะแนนจากบิล '||s.sale_no,
      auth.uid()
    );
  end if;

  return s;
end;
$$;

create or replace view public.member_list
with (security_invoker=true)
as
select
  m.id,m.member_no,m.phone,m.full_name,m.email,m.birthday,
  m.address,m.branch_id,b.code as branch_code,b.name as branch_name,
  m.points_balance,m.total_spent,m.total_visits,m.is_active,
  m.notes,m.created_at,m.updated_at
from public.members m
left join public.branches b on b.id=m.branch_id;

create or replace view public.member_point_history
with (security_invoker=true)
as
select
  t.id,t.member_id,m.member_no,m.full_name,m.phone,
  t.sale_id,s.sale_no,t.transaction_type,t.points_change,
  t.points_before,t.points_after,t.description,t.created_at,
  p.full_name as created_by_name,p.email as created_by_email
from public.member_point_transactions t
join public.members m on m.id=t.member_id
left join public.sales s on s.id=t.sale_id
left join public.profiles p on p.id=t.created_by;

alter table public.members enable row level security;
alter table public.member_point_transactions enable row level security;
alter table public.membership_settings enable row level security;

drop policy if exists members_read on public.members;
drop policy if exists member_points_read on public.member_point_transactions;
drop policy if exists membership_settings_read on public.membership_settings;
drop policy if exists membership_settings_admin on public.membership_settings;

create policy members_read on public.members
for select to authenticated
using(public.is_active_user());

create policy member_points_read on public.member_point_transactions
for select to authenticated
using(public.is_active_user());

create policy membership_settings_read on public.membership_settings
for select to authenticated
using(public.is_active_user());

create policy membership_settings_admin on public.membership_settings
for all to authenticated
using(public.is_admin())
with check(public.is_admin());

grant select on public.members,public.member_point_transactions,
public.membership_settings,public.member_list,public.member_point_history
to authenticated;

grant execute on function public.create_member(
  text,text,text,date,text,uuid,text
) to authenticated;

grant execute on function public.apply_member_to_sale(uuid,uuid,numeric)
to authenticated;

revoke all on public.members from anon;
revoke all on public.member_point_transactions from anon;
revoke all on public.membership_settings from anon;
revoke all on public.member_list from anon;
revoke all on public.member_point_history from anon;

insert into public.system_migrations(phase,description)
values(
  'PHASE_08_3',
  'ระบบสมาชิก คะแนนสะสม ใช้คะแนน และประวัติสมาชิก'
)
on conflict(phase) do update
set description=excluded.description,executed_at=now();

commit;
