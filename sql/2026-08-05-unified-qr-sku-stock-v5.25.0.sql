-- ============================================================
-- TKN POS ERP v5.25.0 — Unified QR / Barcode / SKU / Promotion
-- ไม่ลบข้อมูลเดิม และไม่ล้างสต๊อก
-- รันหลัง PHASE 08.4 และชุด Box QR v5.24.1
-- ============================================================

begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.products
  add column if not exists base_sku text,
  add column if not exists source_barcode text,
  add column if not exists lot_code text,
  add column if not exists lot_cost_letter text,
  add column if not exists product_type_th text,
  add column if not exists model_name text,
  add column if not exists label_name text,
  add column if not exists markup_percent numeric(8,2) not null default 0,
  add column if not exists vat_mode text not null default 'EXCLUDED',
  add column if not exists price_rounding text not null default 'BAHT';

update public.products
set
  base_sku = coalesce(nullif(trim(base_sku),''), nullif(trim(sku_alias),''), product_code),
  label_name = coalesce(nullif(trim(label_name),''), name),
  vat_mode = case when upper(coalesce(vat_mode,'')) in ('EXCLUDED','INCLUDED') then upper(vat_mode) else 'EXCLUDED' end,
  price_rounding = case when upper(coalesce(price_rounding,'')) in ('NONE','BAHT','FIVE','TEN') then upper(price_rounding) else 'BAHT' end
where base_sku is null or label_name is null
   or upper(coalesce(vat_mode,'')) not in ('EXCLUDED','INCLUDED')
   or upper(coalesce(price_rounding,'')) not in ('NONE','BAHT','FIVE','TEN');

create index if not exists idx_products_base_sku on public.products(base_sku);
create index if not exists idx_products_source_barcode on public.products(source_barcode);
create index if not exists idx_products_product_type_th on public.products(product_type_th);
create index if not exists idx_products_model_name on public.products(model_name);

-- ชื่อหมวดหมู่ภาษาไทย (คง id เดิมไว้เพื่อไม่กระทบสต๊อก)
update public.categories set name='ไอทีและอิเล็กทรอนิกส์'
where lower(trim(name)) in ('it','electronics','ไอที')
  and not exists(select 1 from public.categories c2 where lower(trim(c2.name))='ไอทีและอิเล็กทรอนิกส์');
update public.categories set name='เครื่องประดับ'
where lower(trim(name)) in ('จิวเวลรี่','jewelry','jewellery')
  and not exists(select 1 from public.categories c2 where lower(trim(c2.name))='เครื่องประดับ');
update public.categories set name='ของเล่นและโมเดล'
where lower(trim(name)) in ('ของเล่น/โมเดล','toys/models')
  and not exists(select 1 from public.categories c2 where lower(trim(c2.name))='ของเล่นและโมเดล');

do $$
begin
  if not exists(select 1 from public.categories where lower(trim(name)) in ('ออดิโอ','audio')) then
    begin
      insert into public.categories(code,name) values('AUDIO','ออดิโอ');
    exception when others then
      raise notice 'ไม่สามารถเพิ่มหมวดออดิโออัตโนมัติ: % กรุณาเพิ่มจากหน้าหมวดหมู่', sqlerrm;
    end;
  else
    update public.categories set name='ออดิโอ' where lower(trim(name))='audio';
  end if;
end;
$$;

create or replace function public.tkn_compact_cost_v5250(p_cost numeric)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when round(greatest(coalesce(p_cost,0),0),2) = trunc(round(greatest(coalesce(p_cost,0),0),2))
      then trunc(round(greatest(coalesce(p_cost,0),0),2))::text
    else trim(trailing '.' from trim(trailing '0' from round(greatest(coalesce(p_cost,0),0),2)::text))
  end;
$$;

create or replace function public.calculate_selling_price_v5250(
  p_cost numeric,
  p_markup_percent numeric default 0,
  p_vat_rate numeric default 0,
  p_vat_mode text default 'EXCLUDED',
  p_rounding text default 'BAHT'
)
returns numeric
language plpgsql
immutable
set search_path=''
as $$
declare
  v_price numeric;
  v_round text := upper(coalesce(p_rounding,'BAHT'));
begin
  v_price := greatest(coalesce(p_cost,0),0) * (1 + greatest(coalesce(p_markup_percent,0),0) / 100);
  if upper(coalesce(p_vat_mode,'EXCLUDED')) = 'EXCLUDED' then
    v_price := v_price * (1 + greatest(coalesce(p_vat_rate,0),0) / 100);
  end if;

  if v_round = 'NONE' then return round(v_price,2); end if;
  if v_round = 'FIVE' then return ceil(v_price / 5) * 5; end if;
  if v_round = 'TEN' then return ceil(v_price / 10) * 10; end if;
  return ceil(v_price);
end;
$$;

create or replace function public.generate_lot_sku_v5250(
  p_base_sku text,
  p_cost numeric,
  p_letter text default null
)
returns text
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_base text;
  v_letter text;
  v_sku text;
  v_try integer := 0;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;

  v_base := regexp_replace(trim(coalesce(p_base_sku,'')), '-[A-Za-z][0-9]+([.][0-9]{1,2})?$', '', 'i');
  v_base := regexp_replace(v_base, '[^0-9A-Za-zก-๙._-]+', '-', 'g');
  v_base := trim(both '-' from v_base);
  if v_base = '' then raise exception 'กรุณาระบุ SKU หลัก'; end if;

  loop
    v_try := v_try + 1;
    v_letter := upper(left(coalesce(nullif(trim(p_letter),''), chr(65 + floor(random()*26)::integer)),1));
    v_sku := v_base || '-' || v_letter || public.tkn_compact_cost_v5250(p_cost);
    exit when not exists(select 1 from public.products where upper(product_code)=upper(v_sku));
    p_letter := null;
    if v_try >= 52 then
      v_sku := v_base || '-' || v_letter || public.tkn_compact_cost_v5250(p_cost) || '-' || substr(replace(extensions.gen_random_uuid()::text,'-',''),1,4);
      exit;
    end if;
  end loop;
  return v_sku;
end;
$$;

create or replace function public.create_product_lot_v5250(
  p_base_sku text,
  p_name text,
  p_source_barcode text,
  p_category_id uuid,
  p_unit_id uuid,
  p_brand_id uuid default null,
  p_cost_price numeric default 0,
  p_markup_percent numeric default 0,
  p_vat_rate numeric default 0,
  p_vat_mode text default 'EXCLUDED',
  p_price_rounding text default 'BAHT',
  p_selling_price numeric default null,
  p_product_type_th text default null,
  p_model_name text default null,
  p_label_name text default null,
  p_lot_code text default null,
  p_description text default null,
  p_image_url text default null,
  p_minimum_stock numeric default 0,
  p_is_active boolean default true,
  p_initial_branch_id uuid default null,
  p_initial_quantity numeric default 0,
  p_cost_letter text default null
)
returns public.products
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_product public.products;
  v_sku text;
  v_price numeric;
  v_letter text;
begin
  if not public.is_admin() then raise exception 'เฉพาะ Admin เท่านั้นที่เพิ่มสินค้าได้'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'กรุณาระบุชื่อสินค้า'; end if;
  if p_category_id is null or p_unit_id is null then raise exception 'กรุณาเลือกหมวดหมู่และหน่วยนับ'; end if;
  if greatest(coalesce(p_initial_quantity,0),0) <> coalesce(p_initial_quantity,0) then raise exception 'สต๊อกเริ่มต้นต้องไม่น้อยกว่า 0'; end if;

  v_sku := public.generate_lot_sku_v5250(p_base_sku,p_cost_price,p_cost_letter);
  v_letter := substring(v_sku from '-([A-Z])[0-9]+([.][0-9]{1,2})?(-[0-9a-f]{4})?$');
  v_price := coalesce(
    p_selling_price,
    public.calculate_selling_price_v5250(p_cost_price,p_markup_percent,p_vat_rate,p_vat_mode,p_price_rounding)
  );

  insert into public.products(
    product_code, barcode, source_barcode, name, category_id, unit_id, brand_id,
    cost_price, selling_price, minimum_stock, vat_rate, description, image_url,
    quantity, is_active, created_by, updated_by,
    base_sku, lot_code, lot_cost_letter, product_type_th, model_name, label_name,
    markup_percent, vat_mode, price_rounding, sku_alias
  ) values (
    v_sku, v_sku, nullif(trim(p_source_barcode),''), trim(p_name), p_category_id, p_unit_id, p_brand_id,
    greatest(coalesce(p_cost_price,0),0), greatest(coalesce(v_price,0),0), greatest(coalesce(p_minimum_stock,0),0), greatest(coalesce(p_vat_rate,0),0),
    nullif(trim(p_description),''), nullif(trim(p_image_url),''), greatest(coalesce(p_initial_quantity,0),0), coalesce(p_is_active,true), auth.uid(), auth.uid(),
    regexp_replace(trim(p_base_sku), '-[A-Za-z][0-9]+([.][0-9]{1,2})?$', '', 'i'), nullif(trim(p_lot_code),''), v_letter,
    nullif(trim(p_product_type_th),''), nullif(trim(p_model_name),''), coalesce(nullif(trim(p_label_name),''),trim(p_name)),
    greatest(coalesce(p_markup_percent,0),0), upper(coalesce(p_vat_mode,'EXCLUDED')), upper(coalesce(p_price_rounding,'BAHT')),
    regexp_replace(trim(p_base_sku), '-[A-Za-z][0-9]+([.][0-9]{1,2})?$', '', 'i')
  ) returning * into v_product;

  if p_initial_branch_id is not null then
    insert into public.branch_inventory(branch_id,product_id,quantity,minimum_stock)
    values(p_initial_branch_id,v_product.id,greatest(coalesce(p_initial_quantity,0),0),greatest(coalesce(p_minimum_stock,0),0))
    on conflict(branch_id,product_id) do update
      set quantity=excluded.quantity, minimum_stock=excluded.minimum_stock, updated_at=now();
  end if;

  perform public.write_audit_log(
    'CREATE','PRODUCT_LOT',v_product.id::text,v_product.product_code||' - '||v_product.name,
    jsonb_build_object('base_sku',v_product.base_sku,'cost_price',v_product.cost_price,'selling_price',v_product.selling_price,'lot_code',v_product.lot_code),
    p_initial_branch_id,null
  );
  return v_product;
end;
$$;

create or replace function public.ensure_sorting_product_lot_v5250(
  p_sku text,
  p_name text,
  p_category_name text default null,
  p_cost_price numeric default 0,
  p_selling_price numeric default 0,
  p_source_barcode text default null,
  p_product_type_th text default null,
  p_model_name text default null
)
returns public.products
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_product public.products;
  v_category_id uuid;
  v_unit_id uuid;
  v_base_sku text;
begin
  if not public.is_admin() then raise exception 'เฉพาะ Admin เท่านั้นที่สร้างสินค้าในขั้นแยกของได้'; end if;
  if nullif(trim(p_sku),'') is null then raise exception 'กรุณาระบุ SKU'; end if;

  select * into v_product from public.products where upper(product_code)=upper(trim(p_sku)) limit 1;
  if found then return v_product; end if;

  select id into v_category_id from public.categories
  where lower(trim(name))=lower(trim(coalesce(p_category_name,''))) limit 1;
  if v_category_id is null then
    select id into v_category_id from public.categories where lower(trim(name)) in ('อื่น ๆ','อื่นๆ','other') limit 1;
  end if;
  if v_category_id is null then select id into v_category_id from public.categories order by name limit 1; end if;

  select id into v_unit_id from public.units where lower(trim(name)) in ('ชิ้น','piece','pcs') order by name limit 1;
  if v_unit_id is null then select id into v_unit_id from public.units order by name limit 1; end if;
  if v_category_id is null or v_unit_id is null then raise exception 'ไม่พบหมวดหมู่หรือหน่วยนับสำหรับสร้างสินค้า'; end if;

  v_base_sku := regexp_replace(trim(p_sku), '-[A-Za-z][0-9]+([.][0-9]{1,2})?$', '', 'i');
  insert into public.products(
    product_code,barcode,source_barcode,name,category_id,unit_id,cost_price,selling_price,
    quantity,is_active,created_by,updated_by,base_sku,sku_alias,product_type_th,model_name,label_name
  ) values (
    trim(p_sku),trim(p_sku),nullif(trim(p_source_barcode),''),trim(p_name),v_category_id,v_unit_id,
    greatest(coalesce(p_cost_price,0),0),greatest(coalesce(p_selling_price,0),0),0,true,auth.uid(),auth.uid(),
    v_base_sku,v_base_sku,nullif(trim(p_product_type_th),''),nullif(trim(p_model_name),''),trim(p_name)
  ) returning * into v_product;
  return v_product;
exception when unique_violation then
  select * into v_product from public.products where upper(product_code)=upper(trim(p_sku)) limit 1;
  return v_product;
end;
$$;

create or replace function public.update_product_admin_v5250(
  p_product_id uuid,
  p_name text,
  p_source_barcode text,
  p_category_id uuid,
  p_unit_id uuid,
  p_brand_id uuid default null,
  p_cost_price numeric default 0,
  p_markup_percent numeric default 0,
  p_vat_rate numeric default 0,
  p_vat_mode text default 'EXCLUDED',
  p_price_rounding text default 'BAHT',
  p_selling_price numeric default null,
  p_product_type_th text default null,
  p_model_name text default null,
  p_label_name text default null,
  p_lot_code text default null,
  p_description text default null,
  p_image_url text default null,
  p_minimum_stock numeric default 0,
  p_is_active boolean default true
)
returns public.products
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_product public.products;
  v_price numeric;
begin
  if not public.is_admin() then raise exception 'เฉพาะ Admin เท่านั้นที่แก้ไขสินค้าได้'; end if;
  v_price := coalesce(p_selling_price,public.calculate_selling_price_v5250(p_cost_price,p_markup_percent,p_vat_rate,p_vat_mode,p_price_rounding));

  update public.products set
    name=trim(p_name), barcode=product_code, source_barcode=nullif(trim(p_source_barcode),''),
    category_id=p_category_id, unit_id=p_unit_id, brand_id=p_brand_id,
    cost_price=greatest(coalesce(p_cost_price,0),0), selling_price=greatest(coalesce(v_price,0),0),
    minimum_stock=greatest(coalesce(p_minimum_stock,0),0), vat_rate=greatest(coalesce(p_vat_rate,0),0),
    product_type_th=nullif(trim(p_product_type_th),''), model_name=nullif(trim(p_model_name),''),
    label_name=coalesce(nullif(trim(p_label_name),''),trim(p_name)), lot_code=nullif(trim(p_lot_code),''),
    markup_percent=greatest(coalesce(p_markup_percent,0),0), vat_mode=upper(coalesce(p_vat_mode,'EXCLUDED')),
    price_rounding=upper(coalesce(p_price_rounding,'BAHT')), description=nullif(trim(p_description),''), image_url=nullif(trim(p_image_url),''),
    is_active=coalesce(p_is_active,true), updated_by=auth.uid(), updated_at=now()
  where id=p_product_id returning * into v_product;

  if not found then raise exception 'ไม่พบสินค้า'; end if;
  update public.branch_inventory set minimum_stock=v_product.minimum_stock,updated_at=now() where product_id=v_product.id;
  perform public.write_audit_log('UPDATE','PRODUCT',v_product.id::text,v_product.product_code||' - '||v_product.name,
    jsonb_build_object('cost_price',v_product.cost_price,'selling_price',v_product.selling_price,'markup_percent',v_product.markup_percent),null,null);
  return v_product;
end;
$$;

create or replace view public.product_management_list_v5250
with (security_invoker=true)
as
select
  p.id,p.product_code,p.barcode,p.source_barcode,p.name,p.description,p.category_id,c.code as category_code,c.name as category_name,
  p.unit_id,u.name as unit_name,p.brand_id,br.code as brand_code,br.name as brand_name,
  p.cost_price,p.selling_price,p.minimum_stock,p.vat_rate,p.image_url,p.is_active,p.created_at,p.updated_at,
  p.base_sku,p.lot_code,p.lot_cost_letter,p.product_type_th,p.model_name,p.label_name,p.markup_percent,p.vat_mode,p.price_rounding,
  coalesce(sum(bi.quantity),0) as total_branch_quantity,count(distinct bi.branch_id) as branch_count
from public.products p
left join public.categories c on c.id=p.category_id
left join public.units u on u.id=p.unit_id
left join public.brands br on br.id=p.brand_id
left join public.branch_inventory bi on bi.product_id=p.id
group by p.id,c.code,c.name,u.name,br.code,br.name;

create table if not exists public.product_promotions_v5250(
  id uuid primary key default extensions.gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  promo_name text not null,
  promo_price numeric(14,2) not null check(promo_price >= 0),
  start_at timestamptz not null default now(),
  end_at timestamptz,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(end_at is null or end_at > start_at)
);

create index if not exists idx_product_promotions_v5250_active
on public.product_promotions_v5250(product_id,start_at,end_at,is_active);

alter table public.product_promotions_v5250 enable row level security;
drop policy if exists product_promotions_v5250_read on public.product_promotions_v5250;
drop policy if exists product_promotions_v5250_admin on public.product_promotions_v5250;
create policy product_promotions_v5250_read on public.product_promotions_v5250
for select to authenticated using(public.is_active_user());
create policy product_promotions_v5250_admin on public.product_promotions_v5250
for all to authenticated using(public.is_admin()) with check(public.is_admin());

create or replace view public.active_product_promotions_v5250
with (security_invoker=true)
as
select distinct on (pp.product_id)
  pp.id,pp.product_id,pp.promo_name,pp.promo_price,pp.start_at,pp.end_at,
  p.selling_price as normal_price,p.cost_price
from public.product_promotions_v5250 pp
join public.products p on p.id=pp.product_id
where pp.is_active=true and pp.start_at<=now() and (pp.end_at is null or pp.end_at>now())
order by pp.product_id,pp.promo_price asc,pp.created_at desc;

create or replace function public.upsert_product_promotion_v5250(
  p_product_ids uuid[],
  p_promo_name text,
  p_promo_price numeric default null,
  p_discount_percent numeric default null,
  p_start_at timestamptz default now(),
  p_end_at timestamptz default null
)
returns integer
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_product_id uuid;
  v_normal numeric;
  v_price numeric;
  v_count integer := 0;
begin
  if not public.is_admin() then raise exception 'เฉพาะ Admin เท่านั้นที่สร้างโปรโมชั่นได้'; end if;
  if coalesce(array_length(p_product_ids,1),0)=0 then raise exception 'กรุณาเลือกสินค้า'; end if;
  if nullif(trim(p_promo_name),'') is null then raise exception 'กรุณาระบุชื่อโปรโมชั่น'; end if;

  foreach v_product_id in array p_product_ids loop
    select selling_price into v_normal from public.products where id=v_product_id;
    if not found then continue; end if;
    v_price := case
      when p_promo_price is not null then greatest(p_promo_price,0)
      else greatest(v_normal * (1 - greatest(coalesce(p_discount_percent,0),0)/100),0)
    end;
    insert into public.product_promotions_v5250(product_id,promo_name,promo_price,start_at,end_at,is_active,created_by,updated_by)
    values(v_product_id,trim(p_promo_name),round(v_price,2),coalesce(p_start_at,now()),p_end_at,true,auth.uid(),auth.uid());
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.deactivate_product_promotion_v5250(p_promotion_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path=''
as $$
begin
  if not public.is_admin() then raise exception 'เฉพาะ Admin เท่านั้นที่ยกเลิกโปรโมชั่นได้'; end if;
  update public.product_promotions_v5250 set is_active=false,updated_by=auth.uid(),updated_at=now() where id=p_promotion_id;
  return found;
end;
$$;

grant select on public.product_management_list_v5250,public.active_product_promotions_v5250 to authenticated;
grant select,insert,update,delete on public.product_promotions_v5250 to authenticated;
grant execute on function public.tkn_compact_cost_v5250(numeric) to authenticated;
grant execute on function public.calculate_selling_price_v5250(numeric,numeric,numeric,text,text) to authenticated;
grant execute on function public.generate_lot_sku_v5250(text,numeric,text) to authenticated;
grant execute on function public.create_product_lot_v5250(text,text,text,uuid,uuid,uuid,numeric,numeric,numeric,text,text,numeric,text,text,text,text,text,text,numeric,boolean,uuid,numeric,text) to authenticated;
grant execute on function public.ensure_sorting_product_lot_v5250(text,text,text,numeric,numeric,text,text,text) to authenticated;
grant execute on function public.update_product_admin_v5250(uuid,text,text,uuid,uuid,uuid,numeric,numeric,numeric,text,text,numeric,text,text,text,text,text,text,numeric,boolean) to authenticated;
grant execute on function public.upsert_product_promotion_v5250(uuid[],text,numeric,numeric,timestamptz,timestamptz) to authenticated;
grant execute on function public.deactivate_product_promotion_v5250(uuid) to authenticated;

revoke all on public.product_management_list_v5250,public.active_product_promotions_v5250 from anon;
revoke all on public.product_promotions_v5250 from anon;

insert into public.system_migrations(phase,description)
values('TKN_V5_25_0','Unified SKU/QR/Barcode, lot cost code, Thai product types, auto price and product promotions')
on conflict(phase) do update set description=excluded.description,executed_at=now();

commit;
