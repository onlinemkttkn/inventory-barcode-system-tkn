-- TKN POS / ERP — Phase 9.2
-- Module 02: Search Bill Database Foundation
-- IMPORTANT: This function assumes common table concepts.
-- Review and map names to your existing schema before running.

-- Recommended view contract:
-- sales_transactions:
--   id, bill_no, created_at, customer_id, customer_name,
--   sales_channel, payment_channel, grand_total, status, cashier_name
--
-- sales_transaction_items:
--   transaction_id, product_id, sku, barcode, product_name, quantity, unit_price

-- Do not run this block until the existing transaction table names are confirmed.

/*
create or replace function public.search_sales_bills(
  keyword text default null,
  date_from date default null,
  date_to date default null,
  requested_payment_channel text default null,
  requested_sales_channel text default null,
  requested_status text default null,
  result_limit integer default 100
)
returns table (
  transaction_id uuid,
  bill_no text,
  created_at timestamptz,
  customer_name text,
  sales_channel text,
  payment_channel text,
  grand_total numeric,
  status text,
  cashier_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    t.id,
    t.bill_no,
    t.created_at,
    coalesce(t.customer_name, 'Walk-in'),
    t.sales_channel,
    t.payment_channel,
    t.grand_total,
    t.status,
    t.cashier_name
  from public.sales_transactions t
  left join public.sales_transaction_items i
    on i.transaction_id = t.id
  where
    (
      keyword is null
      or keyword = ''
      or t.bill_no ilike '%' || keyword || '%'
      or coalesce(t.customer_name, '') ilike '%' || keyword || '%'
      or coalesce(t.cashier_name, '') ilike '%' || keyword || '%'
      or coalesce(i.sku, '') ilike '%' || keyword || '%'
      or coalesce(i.barcode, '') ilike '%' || keyword || '%'
      or coalesce(i.product_name, '') ilike '%' || keyword || '%'
    )
    and (date_from is null or t.created_at::date >= date_from)
    and (date_to is null or t.created_at::date <= date_to)
    and (
      requested_payment_channel is null
      or requested_payment_channel = ''
      or t.payment_channel = requested_payment_channel
    )
    and (
      requested_sales_channel is null
      or requested_sales_channel = ''
      or t.sales_channel = requested_sales_channel
    )
    and (
      requested_status is null
      or requested_status = ''
      or t.status = requested_status
    )
  order by t.created_at desc
  limit greatest(1, least(result_limit, 500));
$$;
*/
