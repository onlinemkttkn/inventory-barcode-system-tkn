-- TKN Final v5.20.1 — Auto Category + Marketplace Source Sync
-- Run after 2026-08-03-sort-pack-qr-final-v5.20.0.sql

begin;

alter table if exists public.marketplace_sorting_source_items
  add column if not exists main_category text,
  add column if not exists sub_category text,
  add column if not exists source_item_price numeric default 0,
  add column if not exists updated_at timestamptz default now();

-- Remove duplicate source rows before adding the upsert key.
delete from public.marketplace_sorting_source_items newer
using public.marketplace_sorting_source_items older
where newer.id > older.id
  and coalesce(newer.source, '') = coalesce(older.source, '')
  and coalesce(newer.tracking_number, '') = coalesce(older.tracking_number, '')
  and coalesce(newer.source_sku, '') = coalesce(older.source_sku, '')
  and coalesce(newer.source, '') <> ''
  and coalesce(newer.tracking_number, '') <> ''
  and coalesce(newer.source_sku, '') <> '';

create unique index if not exists uq_marketplace_sorting_source_identity
  on public.marketplace_sorting_source_items(source, tracking_number, source_sku);
create index if not exists idx_marketplace_sorting_source_order
  on public.marketplace_sorting_source_items(order_number);
create index if not exists idx_marketplace_sorting_source_sku
  on public.marketplace_sorting_source_items(source_sku);

alter table if exists public.sorting_lot_items
  add column if not exists client_ref text,
  add column if not exists source_category text,
  add column if not exists category_origin text,
  add column if not exists category_confidence numeric default 0,
  add column if not exists category_confirmed boolean default false;

update public.sorting_lot_items
set client_ref = id::text
where client_ref is null or btrim(client_ref) = '';

create unique index if not exists uq_sorting_lot_items_client_ref
  on public.sorting_lot_items(lot_id, client_ref);

create table if not exists public.sorting_sku_category_rules (
  sku text primary key,
  category text not null,
  source text,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint sorting_sku_category_rules_category_check
    check (category in ('IT','รองเท้า','จิวเวลรี่','ของใช้ในบ้าน','ของเล่น/โมเดล','เสื้อผ้า','กระเป๋า','เครื่องสำอาง','อื่น ๆ'))
);

create index if not exists idx_sorting_sku_category_rules_category
  on public.sorting_sku_category_rules(category);

alter table public.sorting_sku_category_rules enable row level security;

do $$
begin
  create policy "authenticated sorting sku rules"
    on public.sorting_sku_category_rules
    for all to authenticated
    using (true)
    with check (true);
exception when duplicate_object then null;
end $$;

commit;
