-- ============================================================
-- TKN POS / ERP MASTER 3.1 GOVERNANCE
-- 10 Standard Roles + Bill Void + Stock Adjustment + Reports
-- Run once after deploying frontend files.
-- ============================================================
begin;

create table if not exists public.app_roles (
  code text primary key,
  name_th text not null,
  landing_page text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_permissions (
  code text primary key,
  module text not null,
  name_th text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_role_permissions (
  role_code text not null references public.app_roles(code) on delete cascade,
  permission_code text not null references public.app_permissions(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(role_code, permission_code)
);

create table if not exists public.app_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_code text not null references public.app_roles(code) on delete restrict,
  branch_id uuid references public.branches(id) on delete set null,
  is_active boolean not null default true,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_action_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id text,
  branch_id uuid references public.branches(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

insert into public.app_roles(code,name_th,landing_page,sort_order)
values
 ('owner','เจ้าของกิจการ','./dashboard.html',10),
 ('admin','ผู้ดูแลระบบ','./dashboard.html',20),
 ('secretary','เลขานุการ','./dashboard.html',30),
 ('manager','ผู้จัดการสาขา','./pos.html',40),
 ('supervisor','หัวหน้างาน','./pos.html',50),
 ('cashier','แคชเชียร์','./pos.html',60),
 ('warehouse','คลังสินค้า','./product-stock-admin.html',70),
 ('purchasing','จัดซื้อ','./purchase-order-history.html',80),
 ('accounting','บัญชี','./reports.html',90),
 ('staff','พนักงาน','./pos.html',100)
on conflict(code) do update
set name_th=excluded.name_th,
    landing_page=excluded.landing_page,
    sort_order=excluded.sort_order,
    is_active=true;

insert into public.app_permissions(code,module,name_th)
values
 ('dashboard.view','dashboard','ดู Dashboard ผู้บริหาร'),
 ('dashboard.branch_view','dashboard','ดู Dashboard สาขา'),
 ('reports.view','reports','ดูรายงาน'),
 ('reports.export','reports','ส่งออกรายงาน'),
 ('bills.view','bills','ตรวจสอบบิล'),
 ('bills.detail','bills','ดูรายละเอียดสินค้าในบิล'),
 ('bills.void','bills','ยกเลิกบิล'),
 ('returns.create','returns','ทำรายการคืนสินค้า'),
 ('returns.view','returns','ดูประวัติคืนสินค้า'),
 ('inventory.view','inventory','ดูสต็อก'),
 ('inventory.adjust','inventory','ปรับสต็อก'),
 ('inventory.receive','inventory','รับสินค้า'),
 ('inventory.issue','inventory','เบิกสินค้า'),
 ('inventory.transfer','inventory','โอนสินค้า'),
 ('products.manage','products','จัดการสินค้า'),
 ('purchasing.manage','purchasing','จัดการ Supplier และ PO'),
 ('users.manage','users','จัดการผู้ใช้และสิทธิ์'),
 ('audit.view','audit','ดู Audit Log'),
 ('pos.use','pos','ใช้งาน POS')
on conflict(code) do update
set module=excluded.module,name_th=excluded.name_th;

delete from public.app_role_permissions;

-- Owner: all.
insert into public.app_role_permissions
select 'owner', code, now() from public.app_permissions;

-- Admin: all operational and administration permissions.
insert into public.app_role_permissions
select 'admin', code, now()
from public.app_permissions;

-- Secretary: executive dashboard, reports, bills and returns read-only.
insert into public.app_role_permissions(role_code,permission_code)
select 'secretary', unnest(array[
 'dashboard.view','reports.view','reports.export',
 'bills.view','bills.detail','returns.view','audit.view'
]);

-- Manager: branch operations, void and returns.
insert into public.app_role_permissions(role_code,permission_code)
select 'manager', unnest(array[
 'dashboard.branch_view','reports.view',
 'bills.view','bills.detail','bills.void',
 'returns.create','returns.view',
 'inventory.view','pos.use'
]);

-- Supervisor.
insert into public.app_role_permissions(role_code,permission_code)
select 'supervisor', unnest(array[
 'bills.view','bills.detail','bills.void',
 'returns.create','returns.view',
 'inventory.view','pos.use'
]);

-- Cashier.
insert into public.app_role_permissions(role_code,permission_code)
select 'cashier', unnest(array[
 'pos.use','bills.view','bills.detail',
 'returns.create'
]);

-- Warehouse.
insert into public.app_role_permissions(role_code,permission_code)
select 'warehouse', unnest(array[
 'inventory.view','inventory.adjust',
 'inventory.receive','inventory.issue','inventory.transfer'
]);

-- Purchasing.
insert into public.app_role_permissions(role_code,permission_code)
select 'purchasing', unnest(array[
 'purchasing.manage','inventory.view','inventory.receive'
]);

-- Accounting.
insert into public.app_role_permissions(role_code,permission_code)
select 'accounting', unnest(array[
 'reports.view','reports.export',
 'bills.view','bills.detail','returns.view','audit.view'
]);

-- Staff.
insert into public.app_role_permissions(role_code,permission_code)
select 'staff', unnest(array['pos.use']);

-- Migrate current profile roles into app_user_roles without overwriting existing assignments.
insert into public.app_user_roles(user_id,role_code,is_active)
select
  p.id,
  case lower(p.role::text)
    when 'owner' then 'owner'
    when 'admin' then 'admin'
    when 'secretary' then 'secretary'
    when 'manager' then 'manager'
    when 'supervisor' then 'supervisor'
    when 'cashier' then 'cashier'
    when 'warehouse' then 'warehouse'
    when 'purchasing' then 'purchasing'
    when 'accounting' then 'accounting'
    else 'staff'
  end,
  coalesce(p.is_active,true)
from public.profiles p
where exists(select 1 from auth.users u where u.id=p.id)
on conflict(user_id) do nothing;

alter table public.app_roles enable row level security;
alter table public.app_permissions enable row level security;
alter table public.app_role_permissions enable row level security;
alter table public.app_user_roles enable row level security;
alter table public.app_action_logs enable row level security;

drop policy if exists roles_read_authenticated on public.app_roles;
create policy roles_read_authenticated
on public.app_roles for select to authenticated using(is_active=true);

drop policy if exists permissions_read_authenticated on public.app_permissions;
create policy permissions_read_authenticated
on public.app_permissions for select to authenticated using(true);

drop policy if exists role_permissions_read_authenticated on public.app_role_permissions;
create policy role_permissions_read_authenticated
on public.app_role_permissions for select to authenticated using(true);

drop policy if exists user_roles_read_self on public.app_user_roles;
create policy user_roles_read_self
on public.app_user_roles for select to authenticated
using(user_id=auth.uid());

grant select on public.app_roles,public.app_permissions,
 public.app_role_permissions to authenticated;
grant select on public.app_user_roles to authenticated;

create or replace function public.current_access_context()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  with ctx as (
    select
      u.id as user_id,
      u.email,
      coalesce(p.full_name,u.email) as full_name,
      coalesce(ur.role_code,
        case lower(coalesce(p.role::text,'staff'))
          when 'owner' then 'owner'
          when 'admin' then 'admin'
          when 'secretary' then 'secretary'
          when 'manager' then 'manager'
          when 'supervisor' then 'supervisor'
          when 'cashier' then 'cashier'
          when 'warehouse' then 'warehouse'
          when 'purchasing' then 'purchasing'
          when 'accounting' then 'accounting'
          else 'staff'
        end
      ) as role_code,
      ur.branch_id,
      coalesce(ur.is_active,p.is_active,true) as is_active
    from auth.users u
    left join public.profiles p on p.id=u.id
    left join public.app_user_roles ur on ur.user_id=u.id
    where u.id=auth.uid()
  )
  select jsonb_build_object(
    'user_id',ctx.user_id,
    'email',ctx.email,
    'full_name',ctx.full_name,
    'role',ctx.role_code,
    'branch_id',ctx.branch_id,
    'is_active',ctx.is_active,
    'landing_page',r.landing_page,
    'permissions',coalesce((
      select jsonb_agg(rp.permission_code order by rp.permission_code)
      from public.app_role_permissions rp
      where rp.role_code=ctx.role_code
    ),'[]'::jsonb)
  )
  from ctx
  left join public.app_roles r on r.code=ctx.role_code;
$$;

grant execute on function public.current_access_context() to authenticated;

create or replace function public.user_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.app_user_roles ur
    join public.app_role_permissions rp
      on rp.role_code=ur.role_code
    where ur.user_id=auth.uid()
      and ur.is_active=true
      and rp.permission_code=p_permission
  )
  or exists(
    select 1
    from public.profiles p
    join public.app_role_permissions rp
      on rp.role_code=
        case lower(coalesce(p.role::text,'staff'))
          when 'owner' then 'owner'
          when 'admin' then 'admin'
          when 'secretary' then 'secretary'
          when 'manager' then 'manager'
          when 'supervisor' then 'supervisor'
          when 'cashier' then 'cashier'
          when 'warehouse' then 'warehouse'
          when 'purchasing' then 'purchasing'
          when 'accounting' then 'accounting'
          else 'staff'
        end
    where p.id=auth.uid()
      and p.is_active=true
      and rp.permission_code=p_permission
  );
$$;

grant execute on function public.user_has_permission(text) to authenticated;

create or replace function public.admin_list_users()
returns table(
 user_id uuid,email text,full_name text,role_code text,
 role_name_th text,branch_id uuid,is_active boolean,last_sign_in_at timestamptz
)
language sql
stable
security definer
set search_path=public
as $$
 select
  u.id,u.email,coalesce(p.full_name,u.email),
  coalesce(ur.role_code,'staff'),r.name_th,ur.branch_id,
  coalesce(ur.is_active,p.is_active,true),u.last_sign_in_at
 from auth.users u
 left join public.profiles p on p.id=u.id
 left join public.app_user_roles ur on ur.user_id=u.id
 left join public.app_roles r on r.code=coalesce(ur.role_code,'staff')
 where public.user_has_permission('users.manage')
 order by u.email;
$$;

grant execute on function public.admin_list_users() to authenticated;

create or replace function public.admin_set_user_role(
 p_user_id uuid,p_role_code text,p_branch_id uuid default null,
 p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
 if not public.user_has_permission('users.manage') then
   raise exception 'ไม่มีสิทธิ์จัดการผู้ใช้';
 end if;

 if not exists(
   select 1 from public.app_roles where code=p_role_code and is_active=true
 ) then
   raise exception 'ไม่พบ Role ที่ระบุ';
 end if;

 insert into public.app_user_roles(
   user_id,role_code,branch_id,is_active,assigned_by,assigned_at,updated_at
 )
 values(
   p_user_id,p_role_code,p_branch_id,p_is_active,
   auth.uid(),now(),now()
 )
 on conflict(user_id) do update
 set role_code=excluded.role_code,
     branch_id=excluded.branch_id,
     is_active=excluded.is_active,
     assigned_by=auth.uid(),
     updated_at=now();

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

create or replace function public.set_branch_product_stock(
 p_branch_id uuid,p_product_id uuid,p_quantity numeric,
 p_minimum_stock numeric default 0,p_reason text default null
)
returns public.branch_inventory
language plpgsql
volatile
security definer
set search_path=public
as $$
declare
 v_row public.branch_inventory;
 v_before numeric;
 v_reason text:=btrim(coalesce(p_reason,''));
begin
 if not public.user_has_permission('inventory.adjust') then
   raise exception 'ไม่มีสิทธิ์ปรับสต็อก';
 end if;
 if length(v_reason)<5 then
   raise exception 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร';
 end if;
 if p_quantity<0 then raise exception 'จำนวนต้องไม่น้อยกว่า 0'; end if;

 select quantity into v_before
 from public.branch_inventory
 where branch_id=p_branch_id and product_id=p_product_id
 for update;

 insert into public.branch_inventory(
  branch_id,product_id,quantity,minimum_stock
 )
 values(p_branch_id,p_product_id,p_quantity,greatest(p_minimum_stock,0))
 on conflict(branch_id,product_id) do update
 set quantity=excluded.quantity,
     minimum_stock=excluded.minimum_stock,
     updated_at=now()
 returning * into v_row;

 insert into public.app_action_logs(
  action,entity_type,entity_id,branch_id,details,created_by
 )
 values(
  'STOCK_ADJUST','PRODUCT',p_product_id::text,p_branch_id,
  jsonb_build_object(
   'before',coalesce(v_before,0),'after',p_quantity,
   'minimum_stock',p_minimum_stock,'reason',v_reason
  ),auth.uid()
 );

 return v_row;
end;
$$;

revoke all on function public.set_branch_product_stock(
 uuid,uuid,numeric,numeric,text
) from public;
grant execute on function public.set_branch_product_stock(
 uuid,uuid,numeric,numeric,text
) to authenticated;

create or replace function public.void_sale_phase_9_2(
 p_sale_id uuid,p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public
as $$
declare
 v_sale public.sales%rowtype;
 v_item record;
 v_reason text:=btrim(coalesce(p_reason,''));
 v_restored jsonb:='[]'::jsonb;
begin
 if not public.user_has_permission('bills.void') then
   raise exception 'ไม่มีสิทธิ์ยกเลิกบิล';
 end if;
 if length(v_reason)<5 then
   raise exception 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร';
 end if;

 select * into v_sale from public.sales
 where id=p_sale_id for update;

 if not found then raise exception 'ไม่พบบิล'; end if;
 if upper(v_sale.status::text)='VOIDED' then
   raise exception 'บิลนี้ถูกยกเลิกแล้ว';
 end if;

 for v_item in
  select product_id,product_name,returnable_quantity
  from public.sale_item_return_balance
  where sale_id=p_sale_id and returnable_quantity>0
 loop
  insert into public.branch_inventory(
   branch_id,product_id,quantity,minimum_stock
  )
  values(v_sale.branch_id,v_item.product_id,v_item.returnable_quantity,0)
  on conflict(branch_id,product_id) do update
  set quantity=public.branch_inventory.quantity+excluded.quantity,
      updated_at=now();

  v_restored:=v_restored||jsonb_build_array(jsonb_build_object(
   'product_id',v_item.product_id,'product_name',v_item.product_name,
   'quantity',v_item.returnable_quantity
  ));
 end loop;

 update public.sales
 set status='VOIDED'::public.sale_status,
     voided_by=auth.uid(),voided_at=now(),
     notes=concat_ws(E'\n',nullif(notes,''),'[VOID] '||v_reason),
     updated_at=now()
 where id=p_sale_id;

 insert into public.app_action_logs(
  action,entity_type,entity_id,branch_id,details,created_by
 )
 values(
  'VOID_SALE','SALE',p_sale_id::text,v_sale.branch_id,
  jsonb_build_object(
   'sale_no',v_sale.sale_no,'previous_status',v_sale.status::text,
   'reason',v_reason,'stock_restored',v_restored
  ),auth.uid()
 );

 return jsonb_build_object(
  'success',true,'sale_id',p_sale_id,'sale_no',v_sale.sale_no,
  'status','VOIDED','stock_restored',v_restored
 );
end;
$$;

revoke all on function public.void_sale_phase_9_2(uuid,text) from public;
grant execute on function public.void_sale_phase_9_2(uuid,text) to authenticated;

commit;
