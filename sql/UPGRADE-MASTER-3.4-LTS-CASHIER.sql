-- ============================================================
-- TKN POS / ERP MASTER 3.4 LTS - CASHIER MODULE
-- Additive migration. Does not replace sales, stock, or existing RBAC.
-- ============================================================
begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.cashier_profiles(
  user_id uuid primary key references auth.users(id) on delete cascade,
  employee_code text not null unique,
  pin_hash text not null,
  display_name text not null,
  branch_id uuid references public.branches(id) on delete set null,
  max_discount_percent numeric not null default 0
    check(max_discount_percent between 0 and 100),
  can_open_drawer boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cashier_shifts(
  id uuid primary key default gen_random_uuid(),
  cashier_user_id uuid not null references auth.users(id) on delete restrict,
  employee_code text not null,
  branch_id uuid not null references public.branches(id) on delete restrict,
  opened_by uuid references auth.users(id) on delete set null,
  closed_by uuid references auth.users(id) on delete set null,
  opening_float numeric not null default 0 check(opening_float>=0),
  closing_cash_count numeric check(closing_cash_count>=0),
  expected_cash numeric,
  cash_difference numeric,
  status text not null default 'OPEN'
    check(status in ('OPEN','CLOSED')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  notes text
);

create unique index if not exists cashier_one_open_shift_per_user
on public.cashier_shifts(cashier_user_id)
where status='OPEN';

create table if not exists public.pos_held_bills(
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  cashier_user_id uuid references auth.users(id) on delete set null,
  hold_no text not null unique,
  payload jsonb not null,
  status text not null default 'HELD'
    check(status in ('HELD','RESTORED','CANCELLED')),
  created_at timestamptz not null default now(),
  restored_at timestamptz
);

alter table public.cashier_profiles enable row level security;
alter table public.cashier_shifts enable row level security;
alter table public.pos_held_bills enable row level security;

drop policy if exists cashier_profiles_self_read on public.cashier_profiles;
create policy cashier_profiles_self_read
on public.cashier_profiles for select to authenticated
using(
  user_id=auth.uid()
  or public.user_has_permission('user.manage'::text,auth.uid())
);

drop policy if exists cashier_shifts_self_read on public.cashier_shifts;
create policy cashier_shifts_self_read
on public.cashier_shifts for select to authenticated
using(
  cashier_user_id=auth.uid()
  or public.user_has_permission('user.manage'::text,auth.uid())
  or public.user_has_permission('report.view'::text,auth.uid())
);

drop policy if exists held_bills_authenticated on public.pos_held_bills;
create policy held_bills_authenticated
on public.pos_held_bills for select to authenticated
using(
  cashier_user_id=auth.uid()
  or public.user_has_permission('pos.use'::text,auth.uid())
);

grant select on public.cashier_profiles,public.cashier_shifts,
  public.pos_held_bills to authenticated;

create or replace function public.cashier_setup_status()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'configured_count',count(*),
    'is_configured',count(*)>0
  )
  from public.cashier_profiles
  where is_active=true;
$$;
grant execute on function public.cashier_setup_status() to authenticated;

create or replace function public.admin_set_cashier_profile(
  p_user_id uuid,
  p_employee_code text,
  p_display_name text,
  p_pin text default null,
  p_branch_id uuid default null,
  p_max_discount_percent numeric default 0,
  p_can_open_drawer boolean default false,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_existing public.cashier_profiles%rowtype;
  v_pin_hash text;
begin
  if not public.user_has_permission('user.manage'::text,auth.uid()) then
    raise exception 'ไม่มีสิทธิ์จัดการข้อมูลแคชเชียร์';
  end if;

  if length(btrim(coalesce(p_employee_code,'')))<2 then
    raise exception 'รหัสพนักงานต้องมีอย่างน้อย 2 ตัวอักษร';
  end if;

  select * into v_existing
  from public.cashier_profiles
  where user_id=p_user_id;

  if p_pin is not null and length(p_pin)<4 then
    raise exception 'PIN ต้องมีอย่างน้อย 4 ตัว';
  end if;

  if p_pin is null and v_existing.user_id is null then
    raise exception 'กรุณากำหนด PIN ครั้งแรก';
  end if;

  v_pin_hash:=case
    when p_pin is not null then extensions.crypt(p_pin,extensions.gen_salt('bf'))
    else v_existing.pin_hash
  end;

  insert into public.cashier_profiles(
    user_id,employee_code,pin_hash,display_name,branch_id,
    max_discount_percent,can_open_drawer,is_active,
    created_by,updated_by,updated_at
  )
  values(
    p_user_id,upper(btrim(p_employee_code)),v_pin_hash,
    btrim(p_display_name),p_branch_id,
    greatest(0,least(coalesce(p_max_discount_percent,0),100)),
    coalesce(p_can_open_drawer,false),coalesce(p_is_active,true),
    auth.uid(),auth.uid(),now()
  )
  on conflict(user_id) do update
  set employee_code=excluded.employee_code,
      pin_hash=excluded.pin_hash,
      display_name=excluded.display_name,
      branch_id=excluded.branch_id,
      max_discount_percent=excluded.max_discount_percent,
      can_open_drawer=excluded.can_open_drawer,
      is_active=excluded.is_active,
      updated_by=auth.uid(),
      updated_at=now();

  insert into public.app_action_logs(
    action,entity_type,entity_id,branch_id,details,created_by
  )
  values(
    'CASHIER_PROFILE_SET','USER',p_user_id::text,p_branch_id,
    jsonb_build_object(
      'employee_code',upper(btrim(p_employee_code)),
      'display_name',btrim(p_display_name),
      'max_discount_percent',p_max_discount_percent,
      'can_open_drawer',p_can_open_drawer,
      'active',p_is_active
    ),
    auth.uid()
  );

  return jsonb_build_object('success',true,'user_id',p_user_id);
end;
$$;
grant execute on function public.admin_set_cashier_profile(
  uuid,text,text,text,uuid,numeric,boolean,boolean
) to authenticated;

create or replace function public.verify_cashier_pin(
  p_employee_code text,
  p_pin text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_profile public.cashier_profiles%rowtype;
begin
  select * into v_profile
  from public.cashier_profiles
  where employee_code=upper(btrim(p_employee_code))
    and is_active=true;

  if not found
     or v_profile.pin_hash<>extensions.crypt(p_pin,v_profile.pin_hash) then
    raise exception 'รหัสพนักงานหรือ PIN ไม่ถูกต้อง';
  end if;

  return jsonb_build_object(
    'user_id',v_profile.user_id,
    'employee_code',v_profile.employee_code,
    'display_name',v_profile.display_name,
    'branch_id',v_profile.branch_id,
    'max_discount_percent',v_profile.max_discount_percent,
    'can_open_drawer',v_profile.can_open_drawer
  );
end;
$$;
grant execute on function public.verify_cashier_pin(text,text) to authenticated;

create or replace function public.open_cashier_shift(
  p_employee_code text,
  p_pin text,
  p_branch_id uuid,
  p_opening_float numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_profile jsonb;
  v_shift public.cashier_shifts;
begin
  v_profile:=public.verify_cashier_pin(p_employee_code,p_pin);

  if coalesce((v_profile->>'branch_id')::uuid,p_branch_id)<>p_branch_id then
    raise exception 'พนักงานไม่ได้รับสิทธิ์ในสาขานี้';
  end if;

  select * into v_shift
  from public.cashier_shifts
  where cashier_user_id=(v_profile->>'user_id')::uuid
    and status='OPEN'
  order by opened_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'shift_id',v_shift.id,
      'employee_code',v_shift.employee_code,
      'display_name',v_profile->>'display_name',
      'opening_float',v_shift.opening_float,
      'opened_at',v_shift.opened_at,
      'can_open_drawer',(v_profile->>'can_open_drawer')::boolean
    );
  end if;

  insert into public.cashier_shifts(
    cashier_user_id,employee_code,branch_id,opened_by,opening_float
  )
  values(
    (v_profile->>'user_id')::uuid,
    v_profile->>'employee_code',
    p_branch_id,auth.uid(),greatest(coalesce(p_opening_float,0),0)
  )
  returning * into v_shift;

  insert into public.app_action_logs(
    action,entity_type,entity_id,branch_id,details,created_by
  )
  values(
    'SHIFT_OPEN','CASHIER_SHIFT',v_shift.id::text,p_branch_id,
    jsonb_build_object(
      'employee_code',v_shift.employee_code,
      'opening_float',v_shift.opening_float
    ),auth.uid()
  );

  return jsonb_build_object(
    'shift_id',v_shift.id,
    'employee_code',v_shift.employee_code,
    'display_name',v_profile->>'display_name',
    'opening_float',v_shift.opening_float,
    'opened_at',v_shift.opened_at,
    'can_open_drawer',(v_profile->>'can_open_drawer')::boolean
  );
end;
$$;
grant execute on function public.open_cashier_shift(text,text,uuid,numeric)
to authenticated;

create or replace function public.close_cashier_shift(
  p_shift_id uuid,
  p_closing_cash_count numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_shift public.cashier_shifts;
  v_cash_sales numeric:=0;
  v_expected numeric:=0;
begin
  select * into v_shift
  from public.cashier_shifts
  where id=p_shift_id and status='OPEN'
  for update;

  if not found then raise exception 'ไม่พบกะที่เปิดอยู่'; end if;

  select coalesce(sum(net_total),0) into v_cash_sales
  from public.sales
  where branch_id=v_shift.branch_id
    and created_at>=v_shift.opened_at
    and upper(status::text)<>'VOIDED'
    and upper(payment_method::text)='CASH';

  v_expected:=v_shift.opening_float+v_cash_sales;

  update public.cashier_shifts
  set status='CLOSED',
      closing_cash_count=greatest(coalesce(p_closing_cash_count,0),0),
      expected_cash=v_expected,
      cash_difference=greatest(coalesce(p_closing_cash_count,0),0)-v_expected,
      closed_by=auth.uid(),
      closed_at=now(),
      notes=nullif(btrim(coalesce(p_notes,'')),'')
  where id=p_shift_id;

  insert into public.app_action_logs(
    action,entity_type,entity_id,branch_id,details,created_by
  )
  values(
    'SHIFT_CLOSE','CASHIER_SHIFT',p_shift_id::text,v_shift.branch_id,
    jsonb_build_object(
      'cash_sales',v_cash_sales,
      'expected_cash',v_expected,
      'closing_cash_count',p_closing_cash_count,
      'difference',greatest(coalesce(p_closing_cash_count,0),0)-v_expected
    ),auth.uid()
  );

  return jsonb_build_object(
    'success',true,
    'expected_cash',v_expected,
    'closing_cash_count',greatest(coalesce(p_closing_cash_count,0),0),
    'difference',greatest(coalesce(p_closing_cash_count,0),0)-v_expected
  );
end;
$$;
grant execute on function public.close_cashier_shift(uuid,numeric,text)
to authenticated;

-- Fix profiles.role enum assignment in the existing user-management RPC.
create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role_code text,
  p_branch_id uuid default null,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role_id uuid;
  v_actor_role text;
  v_target_current_role text;
begin
  if not public.user_has_permission('user.manage'::text,auth.uid()) then
    raise exception 'ไม่มีสิทธิ์จัดการผู้ใช้';
  end if;

  select id into v_role_id
  from public.app_roles
  where code=p_role_code and is_active=true;

  if v_role_id is null then raise exception 'ไม่พบ Role ที่ระบุ'; end if;

  select current_access_context()->>'role' into v_actor_role;

  select r.code into v_target_current_role
  from public.app_user_roles ur
  join public.app_roles r on r.id=ur.role_id
  where ur.user_id=p_user_id and ur.is_active=true
  order by r.sort_order,r.code limit 1;

  if p_role_code='owner' and v_actor_role<>'owner' then
    raise exception 'เฉพาะ Owner เท่านั้นที่กำหนด Owner ได้';
  end if;

  if v_target_current_role='owner' and v_actor_role<>'owner' then
    raise exception 'เฉพาะ Owner เท่านั้นที่แก้ไขบัญชี Owner ได้';
  end if;

  delete from public.app_user_roles where user_id=p_user_id;
  insert into public.app_user_roles(user_id,role_id,is_active,assigned_at)
  values(p_user_id,v_role_id,p_is_active,now());

  execute format(
    'update public.profiles set role=$1::public.app_role,is_active=$2 where id=$3'
  ) using p_role_code,p_is_active,p_user_id;

  insert into public.app_action_logs(
    action,entity_type,entity_id,branch_id,details,created_by
  )
  values(
    'USER_ROLE_SET','USER',p_user_id::text,p_branch_id,
    jsonb_build_object('role',p_role_code,'active',p_is_active),
    auth.uid()
  );

  return jsonb_build_object('success',true,'user_id',p_user_id,'role',p_role_code);
end;
$$;
grant execute on function public.admin_set_user_role(uuid,text,uuid,boolean)
to authenticated;


insert into public.app_permissions(code,module,name_th)
values ('cash_drawer.open_manual','pos','เปิดลิ้นชักเงินสดด้วยตนเอง')
on conflict(code) do update set module=excluded.module,name_th=excluded.name_th;

insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id from public.app_roles r
cross join public.app_permissions p
where r.code in ('owner','admin','manager','supervisor')
  and p.code='cash_drawer.open_manual'
on conflict(role_id,permission_id) do nothing;

create or replace function public.authorize_cash_drawer_reopen_v3_4(
  p_employee_code text,p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_profile jsonb;
begin
  v_profile:=public.verify_cashier_pin(p_employee_code,p_pin);
  if not public.user_has_permission(
    'cash_drawer.open_manual'::text,(v_profile->>'user_id')::uuid
  ) then
    raise exception 'ผู้อนุมัติไม่มีสิทธิ์เปิดลิ้นชักด้วยตนเอง';
  end if;
  insert into public.app_action_logs(
    action,entity_type,entity_id,branch_id,details,created_by
  ) values(
    'CASH_DRAWER_REOPEN_APPROVED','USER',v_profile->>'user_id',
    (v_profile->>'branch_id')::uuid,
    jsonb_build_object('employee_code',v_profile->>'employee_code'),auth.uid()
  );
  return v_profile;
end;
$$;
grant execute on function public.authorize_cash_drawer_reopen_v3_4(text,text)
to authenticated;

commit;
