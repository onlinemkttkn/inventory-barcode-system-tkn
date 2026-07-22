begin;

create or replace function public.get_sales_return_report_phase_9_2(
  p_date_from date default null,
  p_date_to date default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with filtered_returns as (
    select *
    from public.sales_returns sr
    where (p_date_from is null or sr.created_at::date >= p_date_from)
      and (p_date_to is null or sr.created_at::date <= p_date_to)
      and upper(sr.status::text) <> 'VOIDED'
  ),
  summary as (
    select
      count(*)::bigint as return_count,
      coalesce(sum(refund_amount), 0)::numeric as refund_total,
      count(distinct sale_id)::bigint as affected_sales
    from filtered_returns
  ),
  product_summary as (
    select
      sri.product_id,
      max(sri.product_code_snapshot) as product_code,
      max(sri.product_name_snapshot) as product_name,
      sum(sri.quantity)::numeric as returned_quantity,
      sum(sri.refund_amount)::numeric as refund_amount
    from filtered_returns fr
    join public.sales_return_items sri on sri.return_id = fr.id
    group by sri.product_id
    order by returned_quantity desc, refund_amount desc
    limit 20
  ),
  daily_summary as (
    select
      fr.created_at::date as return_date,
      count(*)::bigint as return_count,
      coalesce(sum(fr.refund_amount), 0)::numeric as refund_amount
    from filtered_returns fr
    group by fr.created_at::date
    order by return_date asc
  )
  select jsonb_build_object(
    'summary', (select to_jsonb(summary) from summary),
    'top_products', coalesce(
      (select jsonb_agg(to_jsonb(product_summary)) from product_summary),
      '[]'::jsonb
    ),
    'daily', coalesce(
      (select jsonb_agg(to_jsonb(daily_summary)) from daily_summary),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.get_sales_return_report_phase_9_2(date, date) from public;
grant execute on function public.get_sales_return_report_phase_9_2(date, date) to authenticated;

commit;
