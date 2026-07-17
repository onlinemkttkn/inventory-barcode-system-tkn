-- ============================================================
-- PHASE 08.4
-- PRODUCT MANAGEMENT
-- ร้านเถ้าแก่น้อยชลบุรี
-- ต้องรันหลัง Phase 8.3
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.products') is null then
    raise exception 'ไม่พบ public.products กรุณารัน Phase 1 ก่อน';
  end if;
  if to_regclass('public.categories') is null then
    raise exception 'ไม่พบ public.categories กรุณารัน Phase 1 ก่อน';
  end if;
  if to_regclass('public.units') is null then
    raise exception 'ไม่พบ public.units กรุณารัน Phase 1 ก่อน';
  end if;
  if to_regclass('public.branch_inventory') is null then
    raise exception 'ไม่พบ public.branch_inventory กรุณารัน Phase 7.2 ก่อน';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 1. ยี่ห้อสินค้า
-- ------------------------------------------------------------
create table if not exists public.brands (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_brands_updated_at on public.brands;
create trigger trg_brands_updated_at
before update on public.brands
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 2. เพิ่มฟิลด์สินค้า
-- ------------------------------------------------------------
alter table public.products
  add column if not exists brand_id uuid null
    references public.brands(id) on delete set null,
  add column if not exists description text,
  add column if not exists vat_rate numeric(5,2) not null default 0
    check (vat_rate >= 0 and vat_rate <= 100),
  add column if not exists image_url text,
  add column if not exists sku_alias text,
  add column if not exists allow_negative_stock boolean not null default false;

create index if not exists idx_products_brand
on public.products(brand_id);

create index if not exists idx_products_barcode
on public.products(barcode);

create index if not exists idx_products_name_lower
on public.products(lower(name));

-- ------------------------------------------------------------
-- 3. ลำดับบาร์โค้ดอัตโนมัติ
-- ------------------------------------------------------------
insert into public.code_sequences(
  sequence_name,current_value,prefix,number_length
)
values('PRODUCT_BARCODE',0,'885990',7)
on conflict(sequence_name) do nothing;

create or replace function public.generate_product_barcode()
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
  where sequence_name='PRODUCT_BARCODE'
  for update;

  if not found then
    raise exception 'ไม่พบลำดับ PRODUCT_BARCODE';
  end if;

  update public.code_sequences
  set current_value=n,updated_at=now()
  where sequence_name='PRODUCT_BARCODE';

  return p||lpad(n::text,l,'0');
end;
$$;

-- ------------------------------------------------------------
-- 4. สร้างสินค้า
-- ------------------------------------------------------------
create or replace function public.create_product_admin(
  p_product_code text,
  p_name text,
  p_barcode text,
  p_category_id uuid,
  p_unit_id uuid,
  p_brand_id uuid default null,
  p_cost_price numeric default 0,
  p_selling_price numeric default 0,
  p_minimum_stock numeric default 0,
  p_vat_rate numeric default 0,
  p_description text default null,
  p_image_url text default null,
  p_is_active boolean default true,
  p_initial_branch_id uuid default null,
  p_initial_quantity numeric default 0
)
returns public.products
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  p public.products;
  v_barcode text;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะ Admin เท่านั้นที่เพิ่มสินค้าได้';
  end if;

  if nullif(trim(p_product_code),'') is null then
    raise exception 'กรุณาระบุรหัสสินค้า';
  end if;

  if nullif(trim(p_name),'') is null then
    raise exception 'กรุณาระบุชื่อสินค้า';
  end if;

  if p_category_id is null or p_unit_id is null then
    raise exception 'กรุณาเลือกหมวดหมู่และหน่วยนับ';
  end if;

  if p_initial_quantity < 0 then
    raise exception 'สต๊อกเริ่มต้นต้องไม่น้อยกว่า 0';
  end if;

  v_barcode := nullif(trim(p_barcode),'');

  if v_barcode is null then
    v_barcode := public.generate_product_barcode();
  end if;

  insert into public.products(
    product_code,
    barcode,
    name,
    category_id,
    unit_id,
    brand_id,
    cost_price,
    selling_price,
    minimum_stock,
    vat_rate,
    description,
    image_url,
    quantity,
    is_active,
    created_by,
    updated_by
  )
  values(
    trim(p_product_code),
    v_barcode,
    trim(p_name),
    p_category_id,
    p_unit_id,
    p_brand_id,
    greatest(coalesce(p_cost_price,0),0),
    greatest(coalesce(p_selling_price,0),0),
    greatest(coalesce(p_minimum_stock,0),0),
    greatest(coalesce(p_vat_rate,0),0),
    nullif(trim(p_description),''),
    nullif(trim(p_image_url),''),
    greatest(coalesce(p_initial_quantity,0),0),
    coalesce(p_is_active,true),
    auth.uid(),
    auth.uid()
  )
  returning * into p;

  if p_initial_branch_id is not null then
    insert into public.branch_inventory(
      branch_id,product_id,quantity,minimum_stock
    )
    values(
      p_initial_branch_id,
      p.id,
      greatest(coalesce(p_initial_quantity,0),0),
      greatest(coalesce(p_minimum_stock,0),0)
    )
    on conflict(branch_id,product_id) do update
    set
      quantity=excluded.quantity,
      minimum_stock=excluded.minimum_stock,
      updated_at=now();
  end if;

  perform public.write_audit_log(
    'CREATE','PRODUCT',p.id::text,p.product_code||' - '||p.name,
    jsonb_build_object(
      'barcode',p.barcode,
      'selling_price',p.selling_price,
      'initial_quantity',p_initial_quantity
    ),
    p_initial_branch_id,
    null
  );

  return p;
end;
$$;

-- ------------------------------------------------------------
-- 5. แก้ไขสินค้า
-- ------------------------------------------------------------
create or replace function public.update_product_admin(
  p_product_id uuid,
  p_product_code text,
  p_name text,
  p_barcode text,
  p_category_id uuid,
  p_unit_id uuid,
  p_brand_id uuid default null,
  p_cost_price numeric default 0,
  p_selling_price numeric default 0,
  p_minimum_stock numeric default 0,
  p_vat_rate numeric default 0,
  p_description text default null,
  p_image_url text default null,
  p_is_active boolean default true
)
returns public.products
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  p public.products;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะ Admin เท่านั้นที่แก้ไขสินค้าได้';
  end if;

  update public.products
  set
    product_code=trim(p_product_code),
    name=trim(p_name),
    barcode=nullif(trim(p_barcode),''),
    category_id=p_category_id,
    unit_id=p_unit_id,
    brand_id=p_brand_id,
    cost_price=greatest(coalesce(p_cost_price,0),0),
    selling_price=greatest(coalesce(p_selling_price,0),0),
    minimum_stock=greatest(coalesce(p_minimum_stock,0),0),
    vat_rate=greatest(coalesce(p_vat_rate,0),0),
    description=nullif(trim(p_description),''),
    image_url=nullif(trim(p_image_url),''),
    is_active=coalesce(p_is_active,true),
    updated_by=auth.uid(),
    updated_at=now()
  where id=p_product_id
  returning * into p;

  if not found then
    raise exception 'ไม่พบสินค้า';
  end if;

  update public.branch_inventory
  set minimum_stock=p.minimum_stock,updated_at=now()
  where product_id=p.id;

  perform public.write_audit_log(
    'UPDATE','PRODUCT',p.id::text,p.product_code||' - '||p.name,
    jsonb_build_object(
      'barcode',p.barcode,
      'selling_price',p.selling_price,
      'is_active',p.is_active
    ),
    null,
    null
  );

  return p;
end;
$$;

-- ------------------------------------------------------------
-- 6. ปรับสต๊อกสาขาแบบ Admin
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
set search_path=''
as $$
declare
  bi public.branch_inventory;
  v_before numeric(14,3);
begin
  if not public.is_admin() then
    raise exception 'เฉพาะ Admin เท่านั้นที่ปรับสต๊อกได้';
  end if;

  if p_quantity < 0 then
    raise exception 'จำนวนสต๊อกต้องไม่น้อยกว่า 0';
  end if;

  select quantity into v_before
  from public.branch_inventory
  where branch_id=p_branch_id and product_id=p_product_id;

  insert into public.branch_inventory(
    branch_id,product_id,quantity,minimum_stock
  )
  values(
    p_branch_id,p_product_id,p_quantity,greatest(coalesce(p_minimum_stock,0),0)
  )
  on conflict(branch_id,product_id) do update
  set
    quantity=excluded.quantity,
    minimum_stock=excluded.minimum_stock,
    updated_at=now()
  returning * into bi;

  perform public.write_audit_log(
    'UPDATE','BRANCH_STOCK',p_product_id::text,'ปรับยอดสต๊อก',
    jsonb_build_object(
      'before',coalesce(v_before,0),
      'after',p_quantity,
      'minimum_stock',p_minimum_stock,
      'reason',p_reason
    ),
    p_branch_id,
    null
  );

  return bi;
end;
$$;

-- ------------------------------------------------------------
-- 7. View รายการสินค้า
-- ------------------------------------------------------------
create or replace view public.product_management_list
with (security_invoker=true)
as
select
  p.id,
  p.product_code,
  p.barcode,
  p.name,
  p.description,
  p.category_id,
  c.code as category_code,
  c.name as category_name,
  p.unit_id,
  u.name as unit_name,
  p.brand_id,
  br.code as brand_code,
  br.name as brand_name,
  p.cost_price,
  p.selling_price,
  p.minimum_stock,
  p.vat_rate,
  p.image_url,
  p.is_active,
  p.created_at,
  p.updated_at,
  coalesce(sum(bi.quantity),0) as total_branch_quantity,
  count(distinct bi.branch_id) as branch_count
from public.products p
left join public.categories c on c.id=p.category_id
left join public.units u on u.id=p.unit_id
left join public.brands br on br.id=p.brand_id
left join public.branch_inventory bi on bi.product_id=p.id
group by
  p.id,c.code,c.name,u.name,br.code,br.name;

-- ------------------------------------------------------------
-- 8. RLS
-- ------------------------------------------------------------
alter table public.brands enable row level security;

drop policy if exists brands_read on public.brands;
drop policy if exists brands_admin on public.brands;

create policy brands_read
on public.brands
for select to authenticated
using(public.is_active_user());

create policy brands_admin
on public.brands
for all to authenticated
using(public.is_admin())
with check(public.is_admin());

grant select on public.brands to authenticated;
grant insert,update,delete on public.brands to authenticated;
grant select on public.product_management_list to authenticated;

grant execute on function public.generate_product_barcode() to authenticated;
grant execute on function public.create_product_admin(
  text,text,text,uuid,uuid,uuid,numeric,numeric,numeric,numeric,text,text,boolean,uuid,numeric
) to authenticated;
grant execute on function public.update_product_admin(
  uuid,text,text,text,uuid,uuid,uuid,numeric,numeric,numeric,numeric,text,text,boolean
) to authenticated;
grant execute on function public.set_branch_product_stock(
  uuid,uuid,numeric,numeric,text
) to authenticated;

revoke all on public.brands from anon;
revoke all on public.product_management_list from anon;

insert into public.system_migrations(phase,description)
values(
  'PHASE_08_4',
  'ระบบจัดการสินค้า เพิ่ม แก้ไข ยี่ห้อ สต๊อกสาขา และบาร์โค้ดอัตโนมัติ'
)
on conflict(phase) do update
set description=excluded.description,executed_at=now();

commit;
