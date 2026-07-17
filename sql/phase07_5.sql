-- ============================================================
-- PHASE 07.5
-- STOCK ALERTS & EXECUTIVE DASHBOARD
-- ร้านเถ้าแก่น้อยชลบุรี
-- ต้องรันหลัง Phase 7.4
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.branch_inventory') is null then
    raise exception 'ไม่พบ public.branch_inventory กรุณารัน Phase 7.2 ก่อน';
  end if;

  if to_regclass('public.stock_movements') is null then
    raise exception 'ไม่พบ public.stock_movements กรุณารัน Phase 5 ก่อน';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 1. ตารางตั้งค่าแจ้งเตือน
-- ------------------------------------------------------------
create table if not exists public.stock_alert_settings (
  id uuid primary key default extensions.gen_random_uuid(),
  branch_id uuid null
    references public.branches(id)
    on update cascade
    on delete cascade,

  inactive_days integer not null default 90
    check (inactive_days >= 1),

  low_stock_enabled boolean not null default true,
  out_of_stock_enabled boolean not null default true,
  inactive_stock_enabled boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(branch_id)
);

drop trigger if exists trg_stock_alert_settings_updated_at
on public.stock_alert_settings;

create trigger trg_stock_alert_settings_updated_at
before update on public.stock_alert_settings
for each row
execute function public.set_updated_at();

-- ค่าเริ่มต้นส่วนกลาง
insert into public.stock_alert_settings (
  branch_id,
  inactive_days,
  low_stock_enabled,
  out_of_stock_enabled,
  inactive_stock_enabled
)
values (
  null,
  90,
  true,
  true,
  true
)
on conflict (branch_id) do nothing;

-- ------------------------------------------------------------
-- 2. View สินค้าใกล้หมด/หมด
-- ------------------------------------------------------------
create or replace view public.stock_alert_list
with (security_invoker = true)
as
select
  bi.branch_id,
  b.code as branch_code,
  b.name as branch_name,

  bi.product_id,
  p.product_code,
  p.barcode,
  p.name as product_name,

  c.name as category_name,
  u.name as unit_name,

  bi.quantity,
  bi.minimum_stock,

  case
    when bi.quantity <= 0 then 'OUT_OF_STOCK'
    when bi.quantity <= bi.minimum_stock then 'LOW_STOCK'
    else 'NORMAL'
  end as alert_type,

  greatest(
    bi.minimum_stock - bi.quantity,
    0
  ) as suggested_reorder_quantity,

  p.cost_price,
  p.selling_price,

  greatest(
    bi.minimum_stock - bi.quantity,
    0
  ) * p.cost_price as estimated_reorder_cost,

  bi.updated_at

from public.branch_inventory bi
join public.branches b
  on b.id = bi.branch_id
join public.products p
  on p.id = bi.product_id
left join public.categories c
  on c.id = p.category_id
left join public.units u
  on u.id = p.unit_id
where p.is_active = true
  and (
    bi.quantity <= 0
    or bi.quantity <= bi.minimum_stock
  );

-- ------------------------------------------------------------
-- 3. View สินค้าไม่เคลื่อนไหว
-- ------------------------------------------------------------
create or replace view public.inactive_stock_list
with (security_invoker = true)
as
with last_moves as (
  select
    sm.product_id,
    max(sm.created_at) as last_movement_at
  from public.stock_movements sm
  group by sm.product_id
)
select
  bi.branch_id,
  b.code as branch_code,
  b.name as branch_name,

  bi.product_id,
  p.product_code,
  p.barcode,
  p.name as product_name,

  c.name as category_name,
  u.name as unit_name,

  bi.quantity,
  p.cost_price,
  p.selling_price,

  bi.quantity * p.cost_price as stock_cost_value,

  lm.last_movement_at,

  case
    when lm.last_movement_at is null then
      extract(day from now() - p.created_at)::integer
    else
      extract(day from now() - lm.last_movement_at)::integer
  end as inactive_days

from public.branch_inventory bi
join public.branches b
  on b.id = bi.branch_id
join public.products p
  on p.id = bi.product_id
left join public.categories c
  on c.id = p.category_id
left join public.units u
  on u.id = p.unit_id
left join last_moves lm
  on lm.product_id = bi.product_id
where p.is_active = true
  and bi.quantity > 0;

-- ------------------------------------------------------------
-- 4. Dashboard summary แยกสาขา
-- ------------------------------------------------------------
create or replace view public.executive_stock_dashboard
with (security_invoker = true)
as
select
  b.id as branch_id,
  b.code as branch_code,
  b.name as branch_name,

  count(bi.product_id) as total_products,

  count(*) filter (
    where bi.quantity <= 0
  ) as out_of_stock_count,

  count(*) filter (
    where bi.quantity > 0
      and bi.quantity <= bi.minimum_stock
  ) as low_stock_count,

  coalesce(sum(bi.quantity),0) as total_quantity,

  coalesce(sum(bi.quantity * p.cost_price),0) as total_cost_value,

  coalesce(sum(bi.quantity * p.selling_price),0) as total_sale_value

from public.branches b
left join public.branch_inventory bi
  on bi.branch_id = b.id
left join public.products p
  on p.id = bi.product_id
where b.is_active = true
group by
  b.id,
  b.code,
  b.name;

-- ------------------------------------------------------------
-- 5. RPC สำหรับอ่าน Dashboard รวม
-- ------------------------------------------------------------
create or replace function public.get_stock_alert_summary(
  p_branch_id uuid default null,
  p_inactive_days integer default 90
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'out_of_stock',
      (
        select count(*)
        from public.stock_alert_list
        where alert_type = 'OUT_OF_STOCK'
          and (
            p_branch_id is null
            or branch_id = p_branch_id
          )
      ),

    'low_stock',
      (
        select count(*)
        from public.stock_alert_list
        where alert_type = 'LOW_STOCK'
          and (
            p_branch_id is null
            or branch_id = p_branch_id
          )
      ),

    'inactive_stock',
      (
        select count(*)
        from public.inactive_stock_list
        where inactive_days >= p_inactive_days
          and (
            p_branch_id is null
            or branch_id = p_branch_id
          )
      ),

    'estimated_reorder_cost',
      (
        select coalesce(sum(estimated_reorder_cost),0)
        from public.stock_alert_list
        where (
          p_branch_id is null
          or branch_id = p_branch_id
        )
      )
  );
$$;

-- ------------------------------------------------------------
-- 6. RLS
-- ------------------------------------------------------------
alter table public.stock_alert_settings
enable row level security;

drop policy if exists stock_alert_settings_read
on public.stock_alert_settings;

drop policy if exists stock_alert_settings_admin_write
on public.stock_alert_settings;

create policy stock_alert_settings_read
on public.stock_alert_settings
for select
to authenticated
using(public.is_active_user());

create policy stock_alert_settings_admin_write
on public.stock_alert_settings
for all
to authenticated
using(public.is_admin())
with check(public.is_admin());

grant select on public.stock_alert_settings to authenticated;
grant insert,update,delete on public.stock_alert_settings to authenticated;

grant select on public.stock_alert_list to authenticated;
grant select on public.inactive_stock_list to authenticated;
grant select on public.executive_stock_dashboard to authenticated;

grant execute on function public.get_stock_alert_summary(uuid,integer)
to authenticated;

revoke all on public.stock_alert_settings from anon;
revoke all on public.stock_alert_list from anon;
revoke all on public.inactive_stock_list from anon;
revoke all on public.executive_stock_dashboard from anon;

-- ------------------------------------------------------------
-- 7. Migration
-- ------------------------------------------------------------
insert into public.system_migrations(
  phase,
  description
)
values(
  'PHASE_07_5',
  'ระบบแจ้งเตือนสต๊อก สินค้าใกล้หมด สินค้าหมด และสินค้าไม่เคลื่อนไหว'
)
on conflict(phase) do update
set
  description = excluded.description,
  executed_at = now();

commit;
