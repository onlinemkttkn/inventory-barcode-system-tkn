-- TKN POS / ERP MASTER VERSION 3.0
-- Run once in Supabase SQL Editor after uploading frontend files.
begin;

-- ------------------------------------------------------------
-- Roles and permissions
-- ------------------------------------------------------------
create table if not exists public.app_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_th text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  module text not null,
  name_th text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_role_permissions (
  role_id uuid not null references public.app_roles(id) on delete cascade,
  permission_id uuid not null references public.app_permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.app_user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.app_roles(id) on delete restrict,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

insert into public.app_roles(code,name_th)
values
  ('owner','เจ้าของกิจการ'),
  ('admin','ผู้ดูแลระบบ'),
  ('secretary','เลขานุการ'),
  ('manager','ผู้จัดการ'),
  ('supervisor','หัวหน้าหน้าร้าน'),
  ('accounting','บัญชี'),
  ('warehouse','คลังสินค้า'),
  ('cashier','แคชเชียร์'),
  ('staff','พนักงาน'),
  ('sales','ฝ่ายขาย')
on conflict(code) do update set name_th=excluded.name_th;

insert into public.app_permissions(code,module,name_th)
values
  ('dashboard.view','dashboard','ดู Dashboard ผู้บริหาร'),
  ('dashboard.drilldown','dashboard','ดูรายละเอียดบิลและรายงาน'),
  ('pos.void_bill','pos','ยกเลิกบิล'),
  ('pos.return_create','pos','คืนสินค้า'),
  ('inventory.adjust','inventory','ปรับสต็อก'),
  ('audit.view','audit','ดู Audit Log')
on conflict(code) do update
set module=excluded.module,name_th=excluded.name_th;

-- Owner / Admin: all permissions in this migration
insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
cross join public.app_permissions p
where r.code in ('owner','admin')
on conflict do nothing;

-- Secretary: dashboard/report only
insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
join public.app_permissions p
  on p.code in ('dashboard.view','dashboard.drilldown','audit.view')
where r.code='secretary'
on conflict do nothing;

-- Manager/Supervisor: void and return
insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
join public.app_permissions p
  on p.code in ('pos.void_bill','pos.return_create')
where r.code in ('manager','supervisor')
on conflict do nothing;

-- Warehouse: stock adjustment
insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
join public.app_permissions p on p.code='inventory.adjust'
where r.code='warehouse'
on conflict do nothing;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path=public
as $$
  select lower(coalesce(
    (select role::text from public.profiles where id=auth.uid()),
    'staff'
  ));
$$;

grant execute on function public.current_profile_role() to authenticated;

create or replace function public.user_has_permission(
  requested_permission text,
  requested_user uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select
    exists (
      select 1
      from public.app_user_roles ur
      join public.app_role_permissions rp on rp.role_id=ur.role_id
      join public.app_permissions p on p.id=rp.permission_id
      where ur.user_id=requested_user
        and ur.is_active=true
        and p.code=requested_permission
    )
    or (
      requested_user=auth.uid()
      and (
        (requested_permission in ('dashboard.view','dashboard.drilldown')
          and public.current_profile_role() in ('owner','admin','secretary'))
        or
        (requested_permission='pos.void_bill'
          and public.current_profile_role() in
            ('owner','admin','manager','supervisor'))
        or
        (requested_permission='pos.return_create'
          and public.current_profile_role() in
            ('owner','admin','manager','supervisor','cashier'))
        or
        (requested_permission='inventory.adjust'
          and public.current_profile_role() in ('owner','admin','warehouse'))
        or
        (requested_permission='audit.view'
          and public.current_profile_role() in ('owner','admin','secretary'))
      )
    );
$$;

grant execute on function public.user_has_permission(text,uuid) to authenticated;

-- ------------------------------------------------------------
-- Secure stock adjustment
-- Uses existing audit helper and existing inventory structure.
-- ------------------------------------------------------------
create or replace function public.set_branch_product_stock(
  p_branch_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_minimum_stock numeric default 0,
  p_reason text default null
)
returns public.branch_inventory
language plpgsql
volatile
security definer
set search_path=public
as $$
declare
  v_inventory public.branch_inventory;
  v_before numeric(14,3);
  v_reason text := btrim(coalesce(p_reason,''));
begin
  if not public.user_has_permission('inventory.adjust') then
    raise exception 'ไม่มีสิทธิ์ปรับสต็อก';
  end if;

  if length(v_reason)<5 then
    raise exception 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร';
  end if;

  if p_quantity<0 then
    raise exception 'จำนวนสต็อกต้องไม่น้อยกว่า 0';
  end if;

  select quantity into v_before
  from public.branch_inventory
  where branch_id=p_branch_id and product_id=p_product_id
  for update;

  insert into public.branch_inventory(
    branch_id,product_id,quantity,minimum_stock
  )
  values(
    p_branch_id,p_product_id,p_quantity,
    greatest(coalesce(p_minimum_stock,0),0)
  )
  on conflict(branch_id,product_id) do update
  set quantity=excluded.quantity,
      minimum_stock=excluded.minimum_stock,
      updated_at=now()
  returning * into v_inventory;

  begin
    perform public.write_audit_log(
      'UPDATE','BRANCH_STOCK',p_product_id::text,
      'ปรับยอดสต็อก',
      jsonb_build_object(
        'before',coalesce(v_before,0),
        'after',p_quantity,
        'minimum_stock',p_minimum_stock,
        'reason',v_reason,
        'role',public.current_profile_role()
      ),
      p_branch_id,null
    );
  exception when undefined_function then
    null;
  end;

  return v_inventory;
end;
$$;

revoke all on function public.set_branch_product_stock(
  uuid,uuid,numeric,numeric,text
) from public;
grant execute on function public.set_branch_product_stock(
  uuid,uuid,numeric,numeric,text
) to authenticated;

-- ------------------------------------------------------------
-- Secure bill void
-- This fixes permissions and records audit.
-- Stock restoration remains handled through the existing stock workflow.
-- ------------------------------------------------------------
create or replace function public.void_sale_phase_9_2(
  p_sale_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_sale public.sales%rowtype;
  v_reason text := btrim(coalesce(p_reason,''));
begin
  if not public.user_has_permission('pos.void_bill') then
    raise exception 'ไม่มีสิทธิ์ยกเลิกบิล';
  end if;

  if length(v_reason)<5 then
    raise exception 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร';
  end if;

  select * into v_sale
  from public.sales
  where id=p_sale_id
  for update;

  if not found then raise exception 'ไม่พบบิล'; end if;

  if upper(v_sale.status::text)='VOIDED' then
    raise exception 'บิลนี้ถูกยกเลิกแล้ว';
  end if;

  update public.sales
  set status='VOIDED',
      voided_by=auth.uid(),
      notes=concat_ws(
        E'\n',nullif(notes,''),
        '[VOID] '||v_reason
      ),
      updated_at=now()
  where id=p_sale_id;

  begin
    perform public.write_audit_log(
      'UPDATE','SALE',p_sale_id::text,'ยกเลิกบิล',
      jsonb_build_object(
        'sale_no',v_sale.sale_no,
        'previous_status',v_sale.status::text,
        'new_status','VOIDED',
        'reason',v_reason,
        'role',public.current_profile_role()
      ),
      v_sale.branch_id,null
    );
  exception when undefined_function then
    null;
  end;

  return jsonb_build_object(
    'success',true,
    'sale_id',p_sale_id,
    'sale_no',v_sale.sale_no,
    'status','VOIDED'
  );
end;
$$;

revoke all on function public.void_sale_phase_9_2(uuid,text) from public;
grant execute on function public.void_sale_phase_9_2(uuid,text)
to authenticated;

commit;
