-- ============================================================
-- PHASE 07.4
-- AUDIT LOG ร้านเถ้าแก่น้อยชลบุรี
-- เก็บประวัติการทำรายการ ห้ามแก้ไข/ลบผ่านหน้าเว็บ
-- ต้องรันหลัง Phase 7.3
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'ไม่พบ public.profiles กรุณารัน Phase 4 ก่อน';
  end if;
end;
$$;

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,

  action_type text not null,
  entity_type text not null,
  entity_id text,

  action_label text,
  details jsonb not null default '{}'::jsonb,

  branch_id uuid null
    references public.branches(id)
    on update cascade
    on delete set null,

  user_id uuid null
    references auth.users(id)
    on delete set null,

  user_email text,
  user_name text,

  ip_address inet,
  user_agent text,

  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at
on public.audit_logs(created_at desc);

create index if not exists idx_audit_logs_user
on public.audit_logs(user_id, created_at desc);

create index if not exists idx_audit_logs_entity
on public.audit_logs(entity_type, entity_id);

create index if not exists idx_audit_logs_action
on public.audit_logs(action_type, created_at desc);

create index if not exists idx_audit_logs_branch
on public.audit_logs(branch_id, created_at desc);

comment on table public.audit_logs is
'ประวัติการทำรายการในระบบ แก้ไขและลบผ่านหน้าเว็บไม่ได้';

create or replace function public.write_audit_log(
  p_action_type text,
  p_entity_type text,
  p_entity_id text default null,
  p_action_label text default null,
  p_details jsonb default '{}'::jsonb,
  p_branch_id uuid default null,
  p_user_agent text default null
)
returns public.audit_logs
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_profile public.profiles;
  v_log public.audit_logs;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;

  select *
  into v_profile
  from public.profiles
  where id=auth.uid();

  insert into public.audit_logs(
    action_type,
    entity_type,
    entity_id,
    action_label,
    details,
    branch_id,
    user_id,
    user_email,
    user_name,
    user_agent
  )
  values(
    upper(trim(p_action_type)),
    upper(trim(p_entity_type)),
    nullif(trim(p_entity_id),''),
    nullif(trim(p_action_label),''),
    coalesce(p_details,'{}'::jsonb),
    p_branch_id,
    auth.uid(),
    v_profile.email,
    v_profile.full_name,
    nullif(trim(p_user_agent),'')
  )
  returning * into v_log;

  return v_log;
end;
$$;

-- บันทึก Audit จาก Stock Documents
create or replace function public.audit_stock_document_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.audit_logs(
    action_type,
    entity_type,
    entity_id,
    action_label,
    details,
    user_id,
    created_at
  )
  values(
    case when tg_op='INSERT' then 'CREATE' else 'UPDATE' end,
    'STOCK_DOCUMENT',
    new.id::text,
    new.document_no,
    jsonb_build_object(
      'document_type',new.document_type,
      'status',new.status,
      'reference_no',new.reference_no,
      'supplier_name',new.supplier_name,
      'requester_name',new.requester_name,
      'department',new.department,
      'notes',new.notes
    ),
    coalesce(new.created_by,new.posted_by,new.reversed_by),
    now()
  );

  return new;
end;
$$;

drop trigger if exists trg_audit_stock_documents
on public.stock_documents;

create trigger trg_audit_stock_documents
after insert or update
on public.stock_documents
for each row
execute function public.audit_stock_document_trigger();

-- บันทึก Audit จากใบโอน
create or replace function public.audit_transfer_document_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.audit_logs(
    action_type,
    entity_type,
    entity_id,
    action_label,
    details,
    branch_id,
    user_id,
    created_at
  )
  values(
    case when tg_op='INSERT' then 'CREATE' else 'UPDATE' end,
    'TRANSFER_DOCUMENT',
    new.id::text,
    new.transfer_no,
    jsonb_build_object(
      'status',new.status,
      'source_branch_id',new.source_branch_id,
      'destination_branch_id',new.destination_branch_id,
      'reference_no',new.reference_no,
      'notes',new.notes
    ),
    new.source_branch_id,
    coalesce(new.created_by,new.sent_by,new.received_by),
    now()
  );

  return new;
end;
$$;

drop trigger if exists trg_audit_transfer_documents
on public.transfer_documents;

create trigger trg_audit_transfer_documents
after insert or update
on public.transfer_documents
for each row
execute function public.audit_transfer_document_trigger();

-- บันทึก Audit จากรอบตรวจนับ
create or replace function public.audit_stock_count_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.audit_logs(
    action_type,
    entity_type,
    entity_id,
    action_label,
    details,
    branch_id,
    user_id,
    created_at
  )
  values(
    case when tg_op='INSERT' then 'CREATE' else 'UPDATE' end,
    'STOCK_COUNT',
    new.id::text,
    new.count_no,
    jsonb_build_object(
      'status',new.status,
      'notes',new.notes,
      'completed_at',new.completed_at
    ),
    new.branch_id,
    coalesce(new.created_by,new.completed_by),
    now()
  );

  return new;
end;
$$;

drop trigger if exists trg_audit_stock_count_sessions
on public.stock_count_sessions;

create trigger trg_audit_stock_count_sessions
after insert or update
on public.stock_count_sessions
for each row
execute function public.audit_stock_count_trigger();

-- บันทึก Audit เมื่อสินค้าเปลี่ยน
create or replace function public.audit_product_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.audit_logs(
    action_type,
    entity_type,
    entity_id,
    action_label,
    details,
    user_id,
    created_at
  )
  values(
    case when tg_op='INSERT' then 'CREATE' else 'UPDATE' end,
    'PRODUCT',
    new.id::text,
    new.product_code || ' - ' || new.name,
    jsonb_build_object(
      'product_code',new.product_code,
      'barcode',new.barcode,
      'name',new.name,
      'selling_price',new.selling_price,
      'quantity',new.quantity,
      'is_active',new.is_active
    ),
    coalesce(new.updated_by,new.created_by),
    now()
  );

  return new;
end;
$$;

drop trigger if exists trg_audit_products
on public.products;

create trigger trg_audit_products
after insert or update
on public.products
for each row
execute function public.audit_product_trigger();

create or replace view public.audit_log_list
with (security_invoker=true)
as
select
  a.id,
  a.action_type,
  a.entity_type,
  a.entity_id,
  a.action_label,
  a.details,
  a.branch_id,
  b.code as branch_code,
  b.name as branch_name,
  a.user_id,
  coalesce(a.user_name,p.full_name) as user_name,
  coalesce(a.user_email,p.email) as user_email,
  a.user_agent,
  a.created_at
from public.audit_logs a
left join public.branches b on b.id=a.branch_id
left join public.profiles p on p.id=a.user_id;

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

drop policy if exists audit_logs_admin_read on public.audit_logs;
drop policy if exists audit_logs_staff_read on public.audit_logs;

create policy audit_logs_admin_read
on public.audit_logs
for select
to authenticated
using(public.is_admin());

create policy audit_logs_staff_read
on public.audit_logs
for select
to authenticated
using(
  public.is_active_user()
  and user_id=auth.uid()
);

grant select on public.audit_logs to authenticated;
grant select on public.audit_log_list to authenticated;

grant execute on function public.write_audit_log(
  text,text,text,text,jsonb,uuid,text
) to authenticated;

revoke insert,update,delete on public.audit_logs from authenticated;
revoke all on public.audit_logs from anon;
revoke all on public.audit_log_list from anon;

insert into public.system_migrations(phase,description)
values(
  'PHASE_07_4',
  'ระบบ Audit Log เก็บประวัติสินค้า สต๊อก ใบโอน และตรวจนับ'
)
on conflict(phase) do update
set description=excluded.description,executed_at=now();

commit;
