
begin;

do $$
begin
  if to_regclass('public.products') is null then
    raise exception 'ไม่พบ public.products กรุณารัน Phase 1 ก่อน';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'ไม่พบ public.profiles กรุณารัน Phase 4 ก่อน';
  end if;
end;
$$;

do $$
begin
  create type public.transfer_status as enum ('IN_TRANSIT','RECEIVED','CANCELLED');
exception when duplicate_object then null;
end $$;

create table if not exists public.branches (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text not null,
  branch_type text not null default 'BRANCH'
    check (branch_type in ('HEAD_OFFICE','BRANCH','ONLINE','WAREHOUSE')),
  address text,
  phone text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_branches_updated_at on public.branches;
create trigger trg_branches_updated_at
before update on public.branches
for each row execute function public.set_updated_at();

insert into public.branches (code,name,branch_type,sort_order) values
('BR001','เถ้าแก่น้อยชลบุรี - สำนักงานใหญ่','HEAD_OFFICE',1),
('BR002','เถ้าแก่น้อยชลบุรี - สาขา 2','BRANCH',2),
('ONLINE','คลังสินค้าออนไลน์','ONLINE',3)
on conflict (code) do update set
name=excluded.name, branch_type=excluded.branch_type,
sort_order=excluded.sort_order, updated_at=now();

create table if not exists public.branch_inventory (
  branch_id uuid not null references public.branches(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  minimum_stock numeric(14,3) not null default 0 check (minimum_stock >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch_id,product_id)
);

create table if not exists public.transfer_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  transfer_no text not null unique,
  source_branch_id uuid not null references public.branches(id),
  destination_branch_id uuid not null references public.branches(id),
  status public.transfer_status not null default 'IN_TRANSIT',
  reference_no text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  sent_by uuid references auth.users(id) on delete set null,
  received_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  received_at timestamptz,
  updated_at timestamptz not null default now(),
  check (source_branch_id <> destination_branch_id)
);

create table if not exists public.transfer_items (
  id uuid primary key default extensions.gen_random_uuid(),
  transfer_id uuid not null references public.transfer_documents(id),
  product_id uuid not null references public.products(id),
  quantity_sent numeric(14,3) not null check (quantity_sent > 0),
  quantity_received numeric(14,3) not null default 0 check (quantity_received >= 0),
  note text,
  unique (transfer_id,product_id)
);

insert into public.code_sequences(sequence_name,current_value,prefix,number_length)
values ('TRANSFER_DOCUMENT',0,'TR',6)
on conflict (sequence_name) do nothing;

create or replace function public.generate_next_transfer_no()
returns text language plpgsql volatile security definer set search_path='' as $$
declare n bigint; p text; l integer;
begin
  if not public.is_active_user() then raise exception 'ไม่มีสิทธิ์ใช้งาน'; end if;
  select current_value+1,prefix,number_length into n,p,l
  from public.code_sequences
  where sequence_name='TRANSFER_DOCUMENT' for update;
  update public.code_sequences set current_value=n,updated_at=now()
  where sequence_name='TRANSFER_DOCUMENT';
  return p||to_char(current_date,'YYYYMMDD')||'-'||lpad(n::text,l,'0');
end $$;

insert into public.branch_inventory(branch_id,product_id,quantity,minimum_stock)
select b.id,p.id,p.quantity,p.minimum_stock
from public.branches b cross join public.products p
where b.code='BR001'
on conflict (branch_id,product_id) do nothing;

create or replace function public.create_branch_transfer(
  p_source_branch_id uuid,
  p_destination_branch_id uuid,
  p_items jsonb,
  p_reference_no text default null,
  p_notes text default null
)
returns public.transfer_documents
language plpgsql volatile security definer set search_path='' as $$
declare d public.transfer_documents; i record; available numeric; qty numeric;
begin
  if not public.is_active_user() then raise exception 'ไม่มีสิทธิ์ใช้งาน'; end if;
  if p_source_branch_id=p_destination_branch_id then raise exception 'ต้นทางและปลายทางต้องต่างกัน'; end if;
  if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'ไม่มีรายการสินค้า'; end if;

  insert into public.transfer_documents(
    transfer_no,source_branch_id,destination_branch_id,status,
    reference_no,notes,created_by,sent_by,sent_at
  ) values (
    public.generate_next_transfer_no(),p_source_branch_id,p_destination_branch_id,
    'IN_TRANSIT',nullif(trim(p_reference_no),''),
    nullif(trim(p_notes),''),auth.uid(),auth.uid(),now()
  ) returning * into d;

  for i in
    select (x->>'product_id')::uuid product_id,
           sum((x->>'quantity')::numeric) quantity
    from jsonb_array_elements(p_items) x
    group by (x->>'product_id')::uuid
  loop
    qty:=i.quantity;
    select quantity into available
    from public.branch_inventory
    where branch_id=p_source_branch_id and product_id=i.product_id
    for update;

    if available is null or available < qty then
      raise exception 'สต๊อกต้นทางไม่เพียงพอ';
    end if;

    update public.branch_inventory
    set quantity=quantity-qty,updated_at=now()
    where branch_id=p_source_branch_id and product_id=i.product_id;

    insert into public.transfer_items(transfer_id,product_id,quantity_sent)
    values(d.id,i.product_id,qty);
  end loop;
  return d;
end $$;

create or replace function public.receive_branch_transfer(p_transfer_id uuid)
returns public.transfer_documents
language plpgsql volatile security definer set search_path='' as $$
declare d public.transfer_documents; i record;
begin
  if not public.is_active_user() then raise exception 'ไม่มีสิทธิ์ใช้งาน'; end if;
  select * into d from public.transfer_documents where id=p_transfer_id for update;
  if not found then raise exception 'ไม่พบใบโอน'; end if;
  if d.status<>'IN_TRANSIT' then raise exception 'ใบโอนไม่อยู่ในสถานะรอรับ'; end if;

  for i in select * from public.transfer_items where transfer_id=d.id loop
    insert into public.branch_inventory(branch_id,product_id,quantity)
    values(d.destination_branch_id,i.product_id,i.quantity_sent)
    on conflict(branch_id,product_id) do update
    set quantity=public.branch_inventory.quantity+excluded.quantity,updated_at=now();

    update public.transfer_items
    set quantity_received=quantity_sent where id=i.id;
  end loop;

  update public.transfer_documents
  set status='RECEIVED',received_by=auth.uid(),received_at=now(),updated_at=now()
  where id=d.id returning * into d;
  return d;
end $$;

create or replace view public.branch_inventory_list
with (security_invoker=true) as
select bi.branch_id,b.code branch_code,b.name branch_name,
bi.product_id,p.product_code,p.barcode,p.name product_name,
c.name category_name,u.name unit_name,bi.quantity,bi.minimum_stock,
case when bi.quantity<=0 then 'OUT_OF_STOCK'
when bi.quantity<=bi.minimum_stock then 'LOW_STOCK'
else 'IN_STOCK' end stock_status
from public.branch_inventory bi
join public.branches b on b.id=bi.branch_id
join public.products p on p.id=bi.product_id
left join public.categories c on c.id=p.category_id
left join public.units u on u.id=p.unit_id;

create or replace view public.transfer_document_list
with (security_invoker=true) as
select td.id,td.transfer_no,td.status,td.reference_no,td.notes,
td.source_branch_id,s.name source_branch_name,
td.destination_branch_id,d.name destination_branch_name,
td.created_at,td.sent_at,td.received_at,
count(ti.id) total_lines,coalesce(sum(ti.quantity_sent),0) total_quantity
from public.transfer_documents td
join public.branches s on s.id=td.source_branch_id
join public.branches d on d.id=td.destination_branch_id
left join public.transfer_items ti on ti.transfer_id=td.id
group by td.id,s.name,d.name;

alter table public.branches enable row level security;
alter table public.branch_inventory enable row level security;
alter table public.transfer_documents enable row level security;
alter table public.transfer_items enable row level security;

drop policy if exists branches_read on public.branches;
drop policy if exists branch_inventory_read on public.branch_inventory;
drop policy if exists transfers_read on public.transfer_documents;
drop policy if exists transfer_items_read on public.transfer_items;

create policy branches_read on public.branches for select to authenticated
using(public.is_active_user());
create policy branch_inventory_read on public.branch_inventory for select to authenticated
using(public.is_active_user());
create policy transfers_read on public.transfer_documents for select to authenticated
using(public.is_active_user());
create policy transfer_items_read on public.transfer_items for select to authenticated
using(public.is_active_user());

grant select on public.branches,public.branch_inventory,
public.transfer_documents,public.transfer_items,
public.branch_inventory_list,public.transfer_document_list to authenticated;

grant execute on function public.create_branch_transfer(uuid,uuid,jsonb,text,text) to authenticated;
grant execute on function public.receive_branch_transfer(uuid) to authenticated;

insert into public.system_migrations(phase,description)
values('PHASE_07_2','ระบบโอนสินค้าระหว่างสาขา ร้านเถ้าแก่น้อยชลบุรี')
on conflict(phase) do update set description=excluded.description,executed_at=now();

commit;
