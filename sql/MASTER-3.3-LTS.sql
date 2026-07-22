-- ============================================================
-- TKN POS / ERP MASTER 3.3 LTS
-- Single Production Version
--
-- Uses the existing UUID RBAC schema:
--   app_roles.id -> app_user_roles.role_id
--   app_roles.id -> app_role_permissions.role_id
--   app_permissions.id -> app_role_permissions.permission_id
--
-- Does not create tkn_* RBAC tables.
-- ============================================================
begin;

-- ------------------------------------------------------------
-- 1) Bring the existing role tables to the stable schema.
-- ------------------------------------------------------------
alter table public.app_roles
  add column if not exists landing_page text;

alter table public.app_roles
  add column if not exists sort_order integer not null default 100;

alter table public.app_roles
  add column if not exists is_active boolean not null default true;

insert into public.app_roles(
  code,name_th,is_system,landing_page,sort_order,is_active
)
values
 ('owner','เจ้าของกิจการ',true,'./dashboard.html',10,true),
 ('admin','ผู้ดูแลระบบ',true,'./dashboard.html',20,true),
 ('secretary','เลขานุการ',true,'./dashboard.html',30,true),
 ('manager','ผู้จัดการสาขา',true,'./pos.html',40,true),
 ('supervisor','หัวหน้างาน',true,'./pos.html',50,true),
 ('cashier','แคชเชียร์',true,'./pos.html',60,true),
 ('warehouse','คลังสินค้า',true,'./product-stock-admin.html',70,true),
 ('purchasing','จัดซื้อ',true,'./purchase-order-history.html',80,true),
 ('accounting','บัญชี',true,'./reports.html',90,true),
 ('staff','พนักงาน',true,'./pos.html',100,true)
on conflict(code) do update
set name_th=excluded.name_th,
    landing_page=excluded.landing_page,
    sort_order=excluded.sort_order,
    is_active=excluded.is_active;

-- Keep the existing permissions and add only missing Master permissions.
insert into public.app_permissions(code,module,name_th)
values
 ('pos.use','pos','ใช้งาน POS'),
 ('pos.sell','pos','ขายสินค้า'),
 ('pos.search_bill','pos','ค้นหาบิลย้อนหลัง'),
 ('pos.reprint_receipt','pos','พิมพ์ใบเสร็จซ้ำ'),
 ('pos.void_bill','pos','ยกเลิกบิล'),
 ('pos.return_create','pos','สร้างรายการคืนสินค้า'),
 ('dashboard.view','dashboard','ดู Dashboard ผู้บริหาร'),
 ('dashboard.branch_view','dashboard','ดู Dashboard สาขา'),
 ('dashboard.drilldown','dashboard','ดูรายละเอียด Dashboard'),
 ('report.view','report','ดูรายงาน'),
 ('report.export','report','ส่งออกรายงาน'),
 ('bill.view','bill','ตรวจสอบบิล'),
 ('bill.detail','bill','ดูรายละเอียดสินค้าในบิล'),
 ('inventory.view','inventory','ดูสต็อก'),
 ('inventory.receive','inventory','รับสินค้า'),
 ('inventory.issue','inventory','เบิกสินค้า'),
 ('inventory.transfer','inventory','โอนสินค้า'),
 ('inventory.count','inventory','ตรวจนับสินค้า'),
 ('inventory.adjust','inventory','ปรับยอดสต็อก'),
 ('product.manage','product','จัดการสินค้า'),
 ('purchasing.manage','purchasing','จัดการ Supplier และ PO'),
 ('user.manage','admin','จัดการผู้ใช้'),
 ('permission.manage','admin','จัดการสิทธิ์'),
 ('audit.view','audit','ดูประวัติการทำรายการ')
on conflict(code) do update
set module=excluded.module,
    name_th=excluded.name_th;

-- ------------------------------------------------------------
-- 2) Canonical permission helper.
-- Remove only the incorrect one-argument overload from test packages.
-- Keep and replace the real two-argument signature.
-- ------------------------------------------------------------
drop function if exists public.user_has_permission(text);

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
  select exists(
    select 1
    from public.app_user_roles ur
    join public.app_role_permissions rp on rp.role_id=ur.role_id
    join public.app_permissions p on p.id=rp.permission_id
    join public.app_roles r on r.id=ur.role_id
    where ur.user_id=requested_user
      and ur.is_active=true
      and r.is_active=true
      and p.code=requested_permission
  );
$$;

revoke all on function public.user_has_permission(text,uuid) from public;
grant execute on function public.user_has_permission(text,uuid)
to authenticated;

-- ------------------------------------------------------------
-- 3) Replace the standard role-permission matrix.
-- Existing permissions outside this matrix remain in the catalog,
-- but standard system roles receive the defined permissions below.
-- ------------------------------------------------------------
delete from public.app_role_permissions rp
using public.app_roles r
where rp.role_id=r.id
  and r.code in (
    'owner','admin','secretary','manager','supervisor',
    'cashier','warehouse','purchasing','accounting','staff'
  );

-- Owner and Admin: all current permissions.
insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
cross join public.app_permissions p
where r.code in ('owner','admin')
on conflict(role_id,permission_id) do nothing;

-- Secretary.
insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
join public.app_permissions p on p.code=any(array[
 'dashboard.view','dashboard.drilldown',
 'report.view','report.export',
 'bill.view','bill.detail','audit.view'
]::text[])
where r.code='secretary'
on conflict(role_id,permission_id) do nothing;

-- Manager.
insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
join public.app_permissions p on p.code=any(array[
 'dashboard.branch_view','dashboard.drilldown',
 'report.view','bill.view','bill.detail',
 'pos.use','pos.sell','pos.search_bill','pos.reprint_receipt',
 'pos.void_bill','pos.return_create','inventory.view'
]::text[])
where r.code='manager'
on conflict(role_id,permission_id) do nothing;

-- Supervisor.
insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
join public.app_permissions p on p.code=any(array[
 'bill.view','bill.detail',
 'pos.use','pos.sell','pos.search_bill','pos.reprint_receipt',
 'pos.void_bill','pos.return_create','inventory.view'
]::text[])
where r.code='supervisor'
on conflict(role_id,permission_id) do nothing;

-- Cashier.
insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
join public.app_permissions p on p.code=any(array[
 'pos.use','pos.sell','pos.search_bill',
 'pos.reprint_receipt','pos.return_create',
 'bill.view','bill.detail'
]::text[])
where r.code='cashier'
on conflict(role_id,permission_id) do nothing;

-- Warehouse.
insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
join public.app_permissions p on p.code=any(array[
 'inventory.view','inventory.receive','inventory.issue',
 'inventory.transfer','inventory.count','inventory.adjust'
]::text[])
where r.code='warehouse'
on conflict(role_id,permission_id) do nothing;

-- Purchasing.
insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
join public.app_permissions p on p.code=any(array[
 'purchasing.manage','inventory.view','inventory.receive'
]::text[])
where r.code='purchasing'
on conflict(role_id,permission_id) do nothing;

-- Accounting.
insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
join public.app_permissions p on p.code=any(array[
 'report.view','report.export',
 'bill.view','bill.detail','audit.view'
]::text[])
where r.code='accounting'
on conflict(role_id,permission_id) do nothing;

-- Staff.
insert into public.app_role_permissions(role_id,permission_id)
select r.id,p.id
from public.app_roles r
join public.app_permissions p on p.code=any(array[
 'pos.use','pos.sell'
]::text[])
where r.code='staff'
on conflict(role_id,permission_id) do nothing;

-- ------------------------------------------------------------
-- 4) Import existing profile roles only for users with no app role.
-- ------------------------------------------------------------
insert into public.app_user_roles(user_id,role_id,is_active)
select
  p.id,
  r.id,
  coalesce(p.is_active,true)
from public.profiles p
join public.app_roles r
  on r.code=case lower(coalesce(p.role::text,'staff'))
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
where exists(select 1 from auth.users u where u.id=p.id)
  and not exists(
    select 1 from public.app_user_roles ur where ur.user_id=p.id
  )
on conflict(user_id,role_id) do nothing;

-- ------------------------------------------------------------
-- 5) Audit log.
-- ------------------------------------------------------------
create table if not exists public.app_action_logs(
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id text,
  branch_id uuid references public.branches(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.app_action_logs enable row level security;

drop policy if exists "authorized users can read app action logs"
on public.app_action_logs;

create policy "authorized users can read app action logs"
on public.app_action_logs for select
to authenticated
using(public.user_has_permission('audit.view'::text,auth.uid()));

grant select on public.app_action_logs to authenticated;
revoke insert,update,delete on public.app_action_logs
from authenticated,anon;

-- ------------------------------------------------------------
-- 6) A single access context used by every frontend page.
-- ------------------------------------------------------------
create or replace function public.current_access_context()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  with selected_role as (
    select
      ur.user_id,
      r.id as role_id,
      r.code as role_code,
      r.name_th,
      coalesce(r.landing_page,'./pos.html') as landing_page,
      row_number() over(
        partition by ur.user_id
        order by r.sort_order asc,r.code asc
      ) as role_rank
    from public.app_user_roles ur
    join public.app_roles r on r.id=ur.role_id
    where ur.user_id=auth.uid()
      and ur.is_active=true
      and r.is_active=true
  ),
  ctx as (
    select
      u.id as user_id,
      u.email::text as email,
      coalesce(p.full_name,u.email::text) as full_name,
      coalesce(sr.role_code,'staff') as role_code,
      coalesce(sr.name_th,'พนักงาน') as role_name_th,
      coalesce(sr.landing_page,'./pos.html') as landing_page,
      coalesce(p.is_active,true) as is_active
    from auth.users u
    left join public.profiles p on p.id=u.id
    left join selected_role sr
      on sr.user_id=u.id and sr.role_rank=1
    where u.id=auth.uid()
  )
  select jsonb_build_object(
    'user_id',ctx.user_id,
    'email',ctx.email,
    'full_name',ctx.full_name,
    'role',ctx.role_code,
    'role_name_th',ctx.role_name_th,
    'branch_id',null,
    'is_active',ctx.is_active,
    'landing_page',ctx.landing_page,
    'permissions',coalesce((
      select jsonb_agg(distinct p.code order by p.code)
      from public.app_user_roles ur
      join public.app_role_permissions rp on rp.role_id=ur.role_id
      join public.app_permissions p on p.id=rp.permission_id
      join public.app_roles r on r.id=ur.role_id
      where ur.user_id=ctx.user_id
        and ur.is_active=true
        and r.is_active=true
    ),'[]'::jsonb)
  )
  from ctx;
$$;

revoke all on function public.current_access_context() from public;
grant execute on function public.current_access_context()
to authenticated;

-- ------------------------------------------------------------
-- 7) Owner/Admin user-role administration.
-- One standard active role per user after saving from the UI.
-- ------------------------------------------------------------
create or replace function public.admin_list_users()
returns table(
  user_id uuid,
  email text,
  full_name text,
  role_code text,
  role_name_th text,
  branch_id uuid,
  is_active boolean,
  last_sign_in_at timestamptz
)
language sql
stable
security definer
set search_path=public
as $$
  select
    u.id,
    u.email::text,
    coalesce(p.full_name,u.email::text),
    coalesce((
      select r.code
      from public.app_user_roles ur
      join public.app_roles r on r.id=ur.role_id
      where ur.user_id=u.id and ur.is_active=true
      order by r.sort_order,r.code
      limit 1
    ),'staff'),
    coalesce((
      select r.name_th
      from public.app_user_roles ur
      join public.app_roles r on r.id=ur.role_id
      where ur.user_id=u.id and ur.is_active=true
      order by r.sort_order,r.code
      limit 1
    ),'พนักงาน'),
    null::uuid,
    coalesce(p.is_active,true),
    u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.id=u.id
  where public.user_has_permission('user.manage'::text,auth.uid())
  order by u.email;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users()
to authenticated;

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

  select r.id into v_role_id
  from public.app_roles r
  where r.code=p_role_code and r.is_active=true;

  if v_role_id is null then
    raise exception 'ไม่พบ Role ที่ระบุ';
  end if;

  select current_access_context()->>'role'
  into v_actor_role;

  select r.code into v_target_current_role
  from public.app_user_roles ur
  join public.app_roles r on r.id=ur.role_id
  where ur.user_id=p_user_id and ur.is_active=true
  order by r.sort_order,r.code
  limit 1;

  if p_role_code='owner' and v_actor_role<>'owner' then
    raise exception 'เฉพาะ Owner เท่านั้นที่กำหนด Owner ได้';
  end if;

  if v_target_current_role='owner' and v_actor_role<>'owner' then
    raise exception 'เฉพาะ Owner เท่านั้นที่แก้ไขบัญชี Owner ได้';
  end if;

  delete from public.app_user_roles
  where user_id=p_user_id;

  insert into public.app_user_roles(user_id,role_id,is_active,assigned_at)
  values(p_user_id,v_role_id,p_is_active,now());

  update public.profiles
  set role=p_role_code,
      is_active=p_is_active
  where id=p_user_id;

  insert into public.app_action_logs(
    action,entity_type,entity_id,details,created_by
  )
  values(
    'USER_ROLE_SET','USER',p_user_id::text,
    jsonb_build_object(
      'role',p_role_code,
      'active',p_is_active,
      'branch_id',p_branch_id
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'success',true,
    'user_id',p_user_id,
    'role',p_role_code
  );
end;
$$;

revoke all on function public.admin_set_user_role(
  uuid,text,uuid,boolean
) from public;

grant execute on function public.admin_set_user_role(
  uuid,text,uuid,boolean
) to authenticated;

-- ------------------------------------------------------------
-- 8) Secure stock adjustment.
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
  v_row public.branch_inventory;
  v_before numeric;
  v_reason text:=btrim(coalesce(p_reason,''));
begin
  if not public.user_has_permission(
    'inventory.adjust'::text,auth.uid()
  ) then
    raise exception 'ไม่มีสิทธิ์ปรับสต็อก';
  end if;

  if length(v_reason)<5 then
    raise exception 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร';
  end if;

  if p_quantity<0 then
    raise exception 'จำนวนต้องไม่น้อยกว่า 0';
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
  returning * into v_row;

  insert into public.app_action_logs(
    action,entity_type,entity_id,branch_id,details,created_by
  )
  values(
    'STOCK_ADJUST','PRODUCT',p_product_id::text,p_branch_id,
    jsonb_build_object(
      'before',coalesce(v_before,0),
      'after',p_quantity,
      'minimum_stock',p_minimum_stock,
      'reason',v_reason
    ),
    auth.uid()
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

-- ------------------------------------------------------------
-- 9) Secure bill void and stock restoration.
-- A sale with previous returns must use the return workflow instead.
-- ------------------------------------------------------------
create or replace function public.void_sale_phase_9_2(
  p_sale_id uuid,
  p_reason text
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
  v_set_parts text[]:=array[]::text[];
  v_sql text;
begin
  if not public.user_has_permission(
    'pos.void_bill'::text,auth.uid()
  ) then
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

  if exists(
    select 1
    from public.sale_item_return_balance
    where sale_id=p_sale_id
      and returned_quantity>0
  ) then
    raise exception
      'บิลนี้มีรายการคืนสินค้าแล้ว กรุณาใช้ขั้นตอนคืนสินค้า';
  end if;

  for v_item in
    select product_id,product_name,returnable_quantity
    from public.sale_item_return_balance
    where sale_id=p_sale_id
      and returnable_quantity>0
  loop
    insert into public.branch_inventory(
      branch_id,product_id,quantity,minimum_stock
    )
    values(
      v_sale.branch_id,v_item.product_id,
      v_item.returnable_quantity,0
    )
    on conflict(branch_id,product_id) do update
    set quantity=public.branch_inventory.quantity+excluded.quantity,
        updated_at=now();

    v_restored:=v_restored||jsonb_build_array(
      jsonb_build_object(
        'product_id',v_item.product_id,
        'product_name',v_item.product_name,
        'quantity',v_item.returnable_quantity
      )
    );
  end loop;

  v_set_parts:=array_append(
    v_set_parts,
    'status = ''VOIDED''::public.sale_status'
  );

  if exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='sales'
      and column_name='voided_by'
  ) then
    v_set_parts:=array_append(v_set_parts,'voided_by = auth.uid()');
  end if;

  if exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='sales'
      and column_name='voided_at'
  ) then
    v_set_parts:=array_append(v_set_parts,'voided_at = now()');
  end if;

  if exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='sales'
      and column_name='notes'
  ) then
    v_set_parts:=array_append(
      v_set_parts,
      format(
        'notes = concat_ws(E''\n'',nullif(notes,''''),
         %L)',
        '[VOID] '||v_reason
      )
    );
  end if;

  if exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='sales'
      and column_name='updated_at'
  ) then
    v_set_parts:=array_append(v_set_parts,'updated_at = now()');
  end if;

  v_sql:='update public.sales set '
    ||array_to_string(v_set_parts,', ')
    ||' where id = $1';

  execute v_sql using p_sale_id;

  insert into public.app_action_logs(
    action,entity_type,entity_id,branch_id,details,created_by
  )
  values(
    'VOID_SALE','SALE',p_sale_id::text,v_sale.branch_id,
    jsonb_build_object(
      'sale_no',v_sale.sale_no,
      'previous_status',v_sale.status::text,
      'reason',v_reason,
      'stock_restored',v_restored
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'success',true,
    'sale_id',p_sale_id,
    'sale_no',v_sale.sale_no,
    'status','VOIDED',
    'stock_restored',v_restored
  );
end;
$$;

revoke all on function public.void_sale_phase_9_2(
  uuid,text
) from public;

grant execute on function public.void_sale_phase_9_2(
  uuid,text
) to authenticated;

-- ------------------------------------------------------------
-- 10) Daily / monthly / yearly report and bill drill-down.
-- ------------------------------------------------------------
create or replace function public.get_sales_control_dashboard_v2_1(
  p_period text default 'DAY',
  p_anchor_date date default current_date,
  p_branch_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_period text:=upper(coalesce(p_period,'DAY'));
  v_result jsonb;
begin
  if not (
    public.user_has_permission('report.view'::text,auth.uid())
    or public.user_has_permission('dashboard.view'::text,auth.uid())
    or public.user_has_permission(
      'dashboard.branch_view'::text,auth.uid()
    )
  ) then
    raise exception 'ไม่มีสิทธิ์ดูรายงาน';
  end if;

  if v_period='YEAR' then
    v_start:=date_trunc('year',p_anchor_date::timestamp);
    v_end:=v_start+interval '1 year';
  elsif v_period='MONTH' then
    v_start:=date_trunc('month',p_anchor_date::timestamp);
    v_end:=v_start+interval '1 month';
  else
    v_period:='DAY';
    v_start:=p_anchor_date::timestamp;
    v_end:=v_start+interval '1 day';
  end if;

  with filtered_sales as (
    select s.*
    from public.sales s
    where s.created_at>=v_start
      and s.created_at<v_end
      and (p_branch_id is null or s.branch_id=p_branch_id)
  ),
  active_sales as (
    select * from filtered_sales
    where upper(status::text)<>'VOIDED'
  ),
  summary as (
    select
      count(*)::bigint bill_count,
      coalesce(sum(net_total),0)::numeric gross_revenue,
      coalesce(sum(case when upper(payment_method::text)='CASH'
        then net_total else 0 end),0)::numeric cash_revenue,
      coalesce(sum(case when upper(payment_method::text)
        in ('QR','TRANSFER') then net_total else 0 end),0)::numeric
        qr_transfer_revenue,
      coalesce(sum(case when upper(payment_method::text)='CARD'
        then net_total else 0 end),0)::numeric card_revenue,
      coalesce(avg(net_total),0)::numeric average_bill
    from active_sales
  ),
  void_summary as (
    select
      count(*)::bigint void_count,
      coalesce(sum(net_total),0)::numeric void_amount
    from filtered_sales
    where upper(status::text)='VOIDED'
  ),
  return_summary as (
    select
      count(*)::bigint return_count,
      coalesce(sum(sr.refund_amount),0)::numeric return_amount
    from public.sales_returns sr
    where sr.created_at>=v_start
      and sr.created_at<v_end
      and (p_branch_id is null or sr.branch_id=p_branch_id)
      and upper(sr.status::text)<>'VOIDED'
  ),
  bills as (
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) rows
    from (
      select
        s.id,s.sale_no,s.created_at,s.branch_id,
        s.status::text status,
        s.payment_method::text payment_method,
        s.subtotal,s.discount_amount,s.net_total,
        s.received_amount,s.change_amount,
        s.customer_name,s.customer_phone
      from filtered_sales s
      order by s.created_at desc
      limit greatest(1,least(coalesce(p_limit,100),500))
    ) x
  ),
  items as (
    select jsonb_agg(to_jsonb(x) order by x.sale_id,x.product_name) rows
    from (
      select
        rb.sale_id,rb.product_id,rb.product_code,
        rb.barcode,rb.product_name,rb.sold_quantity,
        rb.returned_quantity,rb.returnable_quantity,
        rb.unit_price,
        (rb.sold_quantity*rb.unit_price)::numeric line_amount
      from public.sale_item_return_balance rb
      join filtered_sales fs on fs.id=rb.sale_id
    ) x
  ),
  trend as (
    select jsonb_agg(to_jsonb(x) order by x.bucket_date) rows
    from (
      select
        case when v_period='YEAR'
          then date_trunc('month',s.created_at)::date
          else s.created_at::date end bucket_date,
        count(*)::bigint bill_count,
        coalesce(sum(case when upper(s.status::text)<>'VOIDED'
          then s.net_total else 0 end),0)::numeric revenue
      from filtered_sales s
      group by 1
    ) x
  )
  select jsonb_build_object(
    'period',jsonb_build_object(
      'type',v_period,'start',v_start,'end',v_end
    ),
    'summary',(select to_jsonb(summary) from summary),
    'voids',(select to_jsonb(void_summary) from void_summary),
    'returns',(select to_jsonb(return_summary) from return_summary),
    'bills',coalesce((select rows from bills),'[]'::jsonb),
    'items',coalesce((select rows from items),'[]'::jsonb),
    'trend',coalesce((select rows from trend),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_sales_control_dashboard_v2_1(
  text,date,uuid,integer
) from public;

grant execute on function public.get_sales_control_dashboard_v2_1(
  text,date,uuid,integer
) to authenticated;

-- ------------------------------------------------------------
-- 11) RLS read policies for the existing RBAC catalog.
-- ------------------------------------------------------------
alter table public.app_roles enable row level security;
alter table public.app_permissions enable row level security;
alter table public.app_role_permissions enable row level security;
alter table public.app_user_roles enable row level security;

drop policy if exists "master authenticated read roles"
on public.app_roles;
create policy "master authenticated read roles"
on public.app_roles for select to authenticated
using(is_active=true);

drop policy if exists "master authenticated read permissions"
on public.app_permissions;
create policy "master authenticated read permissions"
on public.app_permissions for select to authenticated
using(true);

drop policy if exists "master authenticated read role permissions"
on public.app_role_permissions;
create policy "master authenticated read role permissions"
on public.app_role_permissions for select to authenticated
using(true);

drop policy if exists "master user reads own roles"
on public.app_user_roles;
create policy "master user reads own roles"
on public.app_user_roles for select to authenticated
using(
  user_id=auth.uid()
  or public.user_has_permission('user.manage'::text,auth.uid())
);

grant select on public.app_roles,public.app_permissions,
  public.app_role_permissions to authenticated;
grant select on public.app_user_roles to authenticated;

commit;
