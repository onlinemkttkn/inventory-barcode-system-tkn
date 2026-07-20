-- TKN POS / ERP — Phase 9.2
-- Module 2.1: Real Search Bill RPC
-- Uses existing tables:
--   public.sales
--   public.sale_items
--
-- Safe characteristics:
-- - creates/replaces one function only
-- - does not alter existing tables
-- - does not delete or update business data

begin;

create or replace function public.search_sales_bills_phase_9_2(
  p_keyword text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_payment_method text default null,
  p_sales_channel text default null,
  p_status text default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  sale_no text,
  branch_id uuid,
  status text,
  subtotal numeric,
  discount_amount numeric,
  net_total numeric,
  payment_method text,
  received_amount numeric,
  change_amount numeric,
  customer_name text,
  customer_phone text,
  notes text,
  created_by uuid,
  voided_by uuid,
  created_at timestamptz,
  sales_channel text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    s.id,
    s.sale_no,
    s.branch_id,
    s.status::text,
    s.subtotal,
    s.discount_amount,
    s.net_total,
    s.payment_method::text,
    s.received_amount,
    s.change_amount,
    s.customer_name,
    s.customer_phone,
    s.notes,
    s.created_by,
    s.voided_by,
    s.created_at,
    coalesce(
      to_jsonb(s)->>'sales_channel',
      'STORE'
    )::text as sales_channel
  from public.sales s
  left join public.sale_items si
    on si.sale_id = s.id
  where
    (
      p_keyword is null
      or btrim(p_keyword) = ''
      or s.sale_no ilike '%' || btrim(p_keyword) || '%'
      or coalesce(s.customer_name, '') ilike '%' || btrim(p_keyword) || '%'
      or coalesce(s.customer_phone, '') ilike '%' || btrim(p_keyword) || '%'
      or coalesce(si.product_code_snapshot, '') ilike '%' || btrim(p_keyword) || '%'
      or coalesce(si.barcode_snapshot, '') ilike '%' || btrim(p_keyword) || '%'
      or coalesce(si.product_name_snapshot, '') ilike '%' || btrim(p_keyword) || '%'
    )
    and (
      p_date_from is null
      or s.created_at::date >= p_date_from
    )
    and (
      p_date_to is null
      or s.created_at::date <= p_date_to
    )
    and (
      p_payment_method is null
      or btrim(p_payment_method) = ''
      or upper(s.payment_method::text) = upper(btrim(p_payment_method))
    )
    and (
      p_status is null
      or btrim(p_status) = ''
      or upper(s.status::text) = upper(btrim(p_status))
    )
    and (
      p_sales_channel is null
      or btrim(p_sales_channel) = ''
      or upper(
        coalesce(to_jsonb(s)->>'sales_channel', 'STORE')
      ) = upper(btrim(p_sales_channel))
    )
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

revoke all on function public.search_sales_bills_phase_9_2(
  text, date, date, text, text, text, integer
) from public;

grant execute on function public.search_sales_bills_phase_9_2(
  text, date, date, text, text, text, integer
) to authenticated;

commit;

-- Validation
select *
from public.search_sales_bills_phase_9_2(
  p_keyword := null,
  p_date_from := null,
  p_date_to := null,
  p_payment_method := null,
  p_sales_channel := null,
  p_status := null,
  p_limit := 20
);
