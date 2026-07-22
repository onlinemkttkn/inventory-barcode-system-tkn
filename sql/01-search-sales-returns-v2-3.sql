begin;

create or replace function public.search_sales_returns_phase_9_2(
  p_keyword text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_refund_method text default null,
  p_status text default null,
  p_limit integer default 200
)
returns table (
  return_id uuid,
  return_no text,
  sale_id uuid,
  sale_no text,
  branch_id uuid,
  status text,
  refund_method text,
  refund_amount numeric,
  reason text,
  created_by uuid,
  created_at timestamptz,
  item_count bigint,
  total_quantity numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sr.id, sr.return_no, sr.sale_id, s.sale_no, sr.branch_id,
    sr.status::text, sr.refund_method::text, sr.refund_amount,
    sr.reason, sr.created_by, sr.created_at,
    count(sri.id), coalesce(sum(sri.quantity), 0)
  from public.sales_returns sr
  join public.sales s on s.id = sr.sale_id
  left join public.sales_return_items sri on sri.return_id = sr.id
  where (
      p_keyword is null or btrim(p_keyword) = ''
      or sr.return_no ilike '%' || btrim(p_keyword) || '%'
      or s.sale_no ilike '%' || btrim(p_keyword) || '%'
      or coalesce(sr.reason, '') ilike '%' || btrim(p_keyword) || '%'
    )
    and (p_date_from is null or sr.created_at::date >= p_date_from)
    and (p_date_to is null or sr.created_at::date <= p_date_to)
    and (p_refund_method is null or btrim(p_refund_method) = ''
      or upper(sr.refund_method::text) = upper(btrim(p_refund_method)))
    and (p_status is null or btrim(p_status) = ''
      or upper(sr.status::text) = upper(btrim(p_status)))
  group by sr.id, s.sale_no
  order by sr.created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

revoke all on function public.search_sales_returns_phase_9_2(
  text, date, date, text, text, integer
) from public;
grant execute on function public.search_sales_returns_phase_9_2(
  text, date, date, text, text, integer
) to authenticated;

commit;
