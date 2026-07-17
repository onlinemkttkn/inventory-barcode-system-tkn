-- ============================================================
-- PHASE 08.2
-- DASHBOARD VERSION 2
-- ร้านเถ้าแก่น้อยชลบุรี
-- ต้องรันหลัง Phase 8.1
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.sales') is null then
    raise exception 'ไม่พบ public.sales กรุณารัน Phase 8.1 ก่อน';
  end if;
  if to_regclass('public.branch_inventory') is null then
    raise exception 'ไม่พบ public.branch_inventory กรุณารัน Phase 7.2 ก่อน';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 1. Dashboard summary รวมทุกสาขา
-- ------------------------------------------------------------
create or replace view public.dashboard_v2_summary
with (security_invoker=true)
as
select
  (select count(*) from public.products where is_active=true)
    as total_products,

  (select count(*) from public.categories)
    as total_categories,

  (select count(*)
   from public.branch_inventory bi
   join public.products p on p.id=bi.product_id
   where p.is_active=true
     and bi.quantity <= 0)
    as out_of_stock_count,

  (select count(*)
   from public.branch_inventory bi
   join public.products p on p.id=bi.product_id
   where p.is_active=true
     and bi.quantity > 0
     and bi.quantity <= bi.minimum_stock)
    as low_stock_count,

  (select coalesce(sum(s.net_total),0)
   from public.sales s
   where s.status='COMPLETED'
     and s.created_at >= date_trunc('day',now()))
    as sales_today,

  (select count(*)
   from public.sales s
   where s.status='COMPLETED'
     and s.created_at >= date_trunc('day',now()))
    as bills_today,

  (select coalesce(sum(s.net_total),0)
   from public.sales s
   where s.status='COMPLETED'
     and s.created_at >= date_trunc('month',now()))
    as sales_month,

  (select count(*)
   from public.transfer_documents td
   where td.status='IN_TRANSIT')
    as pending_transfers,

  (select coalesce(sum(bi.quantity*p.cost_price),0)
   from public.branch_inventory bi
   join public.products p on p.id=bi.product_id)
    as stock_cost_value,

  (select coalesce(sum(bi.quantity*p.selling_price),0)
   from public.branch_inventory bi
   join public.products p on p.id=bi.product_id)
    as stock_sale_value;

-- ------------------------------------------------------------
-- 2. สินค้าล่าสุดจากสต๊อกแยกสาขา
-- ------------------------------------------------------------
create or replace view public.dashboard_recent_inventory
with (security_invoker=true)
as
select
  bi.branch_id,
  b.code as branch_code,
  b.name as branch_name,

  bi.product_id,
  p.product_code,
  p.barcode,
  p.name as product_name,

  bi.quantity,
  bi.minimum_stock,

  case
    when bi.quantity <= 0 then 'OUT_OF_STOCK'
    when bi.quantity <= bi.minimum_stock then 'LOW_STOCK'
    else 'IN_STOCK'
  end as stock_status,

  bi.updated_at
from public.branch_inventory bi
join public.branches b on b.id=bi.branch_id
join public.products p on p.id=bi.product_id
where b.is_active=true
  and p.is_active=true;

-- ------------------------------------------------------------
-- 3. ยอดขายล่าสุด
-- ------------------------------------------------------------
create or replace view public.dashboard_recent_sales
with (security_invoker=true)
as
select
  s.id,
  s.sale_no,
  s.branch_id,
  b.code as branch_code,
  b.name as branch_name,
  s.net_total,
  s.payment_method,
  s.customer_name,
  s.created_at,
  p.full_name as created_by_name,
  p.email as created_by_email
from public.sales s
join public.branches b on b.id=s.branch_id
left join public.profiles p on p.id=s.created_by
where s.status='COMPLETED';

-- ------------------------------------------------------------
-- 4. สินค้าขายดีเดือนนี้
-- ------------------------------------------------------------
create or replace view public.dashboard_top_products_month
with (security_invoker=true)
as
select
  si.product_id,
  si.product_code_snapshot as product_code,
  si.product_name_snapshot as product_name,
  sum(si.quantity) as total_quantity,
  sum(si.line_total) as total_sales
from public.sale_items si
join public.sales s on s.id=si.sale_id
where s.status='COMPLETED'
  and s.created_at >= date_trunc('month',now())
group by
  si.product_id,
  si.product_code_snapshot,
  si.product_name_snapshot;

-- ------------------------------------------------------------
-- 5. สรุปยอดขายรายวัน 14 วัน
-- ------------------------------------------------------------
create or replace view public.dashboard_sales_daily
with (security_invoker=true)
as
select
  date_trunc('day',s.created_at)::date as sale_date,
  count(*) as total_bills,
  coalesce(sum(s.net_total),0) as total_sales
from public.sales s
where s.status='COMPLETED'
  and s.created_at >= date_trunc('day',now()) - interval '13 days'
group by date_trunc('day',s.created_at)::date
order by sale_date;

grant select on public.dashboard_v2_summary to authenticated;
grant select on public.dashboard_recent_inventory to authenticated;
grant select on public.dashboard_recent_sales to authenticated;
grant select on public.dashboard_top_products_month to authenticated;
grant select on public.dashboard_sales_daily to authenticated;

revoke all on public.dashboard_v2_summary from anon;
revoke all on public.dashboard_recent_inventory from anon;
revoke all on public.dashboard_recent_sales from anon;
revoke all on public.dashboard_top_products_month from anon;
revoke all on public.dashboard_sales_daily from anon;

insert into public.system_migrations(phase,description)
values(
  'PHASE_08_2',
  'Dashboard Version 2 สต๊อกแยกสาขา ยอดขาย POS และข้อมูลล่าสุด'
)
on conflict(phase) do update
set description=excluded.description,executed_at=now();

commit;
