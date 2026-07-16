-- PHASE 06.5: Integrated dashboard
begin;

create or replace view public.dashboard_summary
with (security_invoker = true)
as
select
  (select count(*) from public.products) as total_products,
  (select count(*) from public.categories) as total_categories,
  (select count(*) from public.products where quantity <= 0) as out_of_stock,
  (select count(*) from public.products where quantity > 0 and quantity <= minimum_stock) as low_stock;

grant select on public.dashboard_summary to authenticated;
revoke all on public.dashboard_summary from anon;

insert into public.system_migrations (phase, description)
values (
  'PHASE_06_5',
  'รวม Dashboard, Scanner, Barcode/QR Generator และ Portable Printing'
)
on conflict (phase) do update
set description = excluded.description,
    executed_at = now();

commit;
