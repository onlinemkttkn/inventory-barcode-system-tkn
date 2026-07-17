-- ============================================================
-- PHASE 08.5
-- SYSTEM CONFIG + IMPORT / EXPORT
-- ร้านเถ้าแก่น้อยชลบุรี
-- ต้องรันหลัง Phase 8.4
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.products') is null then
    raise exception 'ไม่พบ public.products กรุณารัน Phase 1 ก่อน';
  end if;

  if to_regclass('public.product_management_list') is null then
    raise exception 'ไม่พบ public.product_management_list กรุณารัน Phase 8.4 ก่อน';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 1. ประวัติ Import
-- ------------------------------------------------------------
create table if not exists public.product_import_batches (
  id uuid primary key default extensions.gen_random_uuid(),

  file_name text,
  total_rows integer not null default 0,
  success_rows integer not null default 0,
  failed_rows integer not null default 0,

  status text not null default 'PROCESSING'
    check (status in ('PROCESSING','COMPLETED','FAILED')),

  error_summary jsonb not null default '[]'::jsonb,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.product_import_rows (
  id bigint generated always as identity primary key,

  batch_id uuid not null
    references public.product_import_batches(id)
    on delete cascade,

  row_number integer not null,
  product_code text,
  barcode text,
  product_name text,

  status text not null
    check (status in ('SUCCESS','FAILED')),

  message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_import_rows_batch
on public.product_import_rows(batch_id,row_number);

-- ------------------------------------------------------------
-- 2. RPC Import สินค้าหนึ่งรายการ
-- ใช้จากหน้าเว็บหลังตรวจสอบ CSV
-- ------------------------------------------------------------
create or replace function public.import_product_row(
  p_product_code text,
  p_name text,
  p_barcode text,
  p_category_code text,
  p_unit_name text,
  p_brand_code text default null,
  p_cost_price numeric default 0,
  p_selling_price numeric default 0,
  p_minimum_stock numeric default 0,
  p_vat_rate numeric default 0,
  p_initial_branch_code text default null,
  p_initial_quantity numeric default 0,
  p_description text default null
)
returns public.products
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_category_id uuid;
  v_unit_id uuid;
  v_brand_id uuid;
  v_branch_id uuid;
  v_product public.products;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะ Admin เท่านั้นที่ Import สินค้าได้';
  end if;

  select id into v_category_id
  from public.categories
  where upper(code)=upper(trim(p_category_code))
  limit 1;

  if v_category_id is null then
    raise exception 'ไม่พบรหัสหมวดหมู่ %',p_category_code;
  end if;

  select id into v_unit_id
  from public.units
  where lower(name)=lower(trim(p_unit_name))
  limit 1;

  if v_unit_id is null then
    raise exception 'ไม่พบหน่วยนับ %',p_unit_name;
  end if;

  if nullif(trim(p_brand_code),'') is not null then
    select id into v_brand_id
    from public.brands
    where upper(code)=upper(trim(p_brand_code))
    limit 1;

    if v_brand_id is null then
      raise exception 'ไม่พบรหัสยี่ห้อ %',p_brand_code;
    end if;
  end if;

  if nullif(trim(p_initial_branch_code),'') is not null then
    select id into v_branch_id
    from public.branches
    where upper(code)=upper(trim(p_initial_branch_code))
    limit 1;

    if v_branch_id is null then
      raise exception 'ไม่พบรหัสสาขา %',p_initial_branch_code;
    end if;
  end if;

  v_product := public.create_product_admin(
    p_product_code,
    p_name,
    p_barcode,
    v_category_id,
    v_unit_id,
    v_brand_id,
    p_cost_price,
    p_selling_price,
    p_minimum_stock,
    p_vat_rate,
    p_description,
    null,
    true,
    v_branch_id,
    p_initial_quantity
  );

  return v_product;
end;
$$;

-- ------------------------------------------------------------
-- 3. View Export
-- ------------------------------------------------------------
create or replace view public.product_export_list
with (security_invoker=true)
as
select
  p.product_code,
  p.barcode,
  p.name as product_name,
  c.code as category_code,
  c.name as category_name,
  u.name as unit_name,
  br.code as brand_code,
  br.name as brand_name,
  p.cost_price,
  p.selling_price,
  p.minimum_stock,
  p.vat_rate,
  p.description,
  p.is_active,
  coalesce(sum(bi.quantity),0) as total_quantity,
  p.created_at,
  p.updated_at
from public.products p
left join public.categories c on c.id=p.category_id
left join public.units u on u.id=p.unit_id
left join public.brands br on br.id=p.brand_id
left join public.branch_inventory bi on bi.product_id=p.id
group by
  p.id,c.code,c.name,u.name,br.code,br.name;

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------
alter table public.product_import_batches enable row level security;
alter table public.product_import_rows enable row level security;

drop policy if exists import_batches_admin on public.product_import_batches;
drop policy if exists import_rows_admin on public.product_import_rows;

create policy import_batches_admin
on public.product_import_batches
for all to authenticated
using(public.is_admin())
with check(public.is_admin());

create policy import_rows_admin
on public.product_import_rows
for all to authenticated
using(public.is_admin())
with check(public.is_admin());

grant select,insert,update on public.product_import_batches to authenticated;
grant select,insert on public.product_import_rows to authenticated;
grant select on public.product_export_list to authenticated;

grant execute on function public.import_product_row(
  text,text,text,text,text,text,numeric,numeric,numeric,numeric,text,numeric,text
) to authenticated;

revoke all on public.product_import_batches from anon;
revoke all on public.product_import_rows from anon;
revoke all on public.product_export_list from anon;

insert into public.system_migrations(phase,description)
values(
  'PHASE_08_5',
  'Supabase Config กลาง Import CSV Export CSV Template และประวัติ Import'
)
on conflict(phase) do update
set description=excluded.description,executed_at=now();

commit;
