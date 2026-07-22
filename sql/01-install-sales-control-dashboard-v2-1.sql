begin;

create or replace function public.get_sales_control_dashboard_v2_1(
  p_period text default 'DAY',
  p_anchor_date date default current_date,
  p_branch_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_period text := upper(coalesce(p_period, 'DAY'));
  v_result jsonb;
begin
  if v_period = 'YEAR' then
    v_start := date_trunc('year', p_anchor_date::timestamp);
    v_end := v_start + interval '1 year';
  elsif v_period = 'MONTH' then
    v_start := date_trunc('month', p_anchor_date::timestamp);
    v_end := v_start + interval '1 month';
  else
    v_period := 'DAY';
    v_start := p_anchor_date::timestamp;
    v_end := v_start + interval '1 day';
  end if;

  with filtered_sales as (
    select s.*
    from public.sales s
    where s.created_at >= v_start
      and s.created_at < v_end
      and (p_branch_id is null or s.branch_id = p_branch_id)
  ),
  active_sales as (
    select * from filtered_sales
    where upper(status::text) <> 'VOIDED'
  ),
  summary as (
    select
      count(*)::bigint as bill_count,
      coalesce(sum(net_total), 0)::numeric as gross_revenue,
      coalesce(sum(case when upper(payment_method::text) = 'CASH' then net_total else 0 end), 0)::numeric as cash_revenue,
      coalesce(sum(case when upper(payment_method::text) in ('QR','TRANSFER') then net_total else 0 end), 0)::numeric as qr_transfer_revenue,
      coalesce(sum(case when upper(payment_method::text) = 'CARD' then net_total else 0 end), 0)::numeric as card_revenue,
      coalesce(avg(net_total), 0)::numeric as average_bill
    from active_sales
  ),
  void_summary as (
    select count(*)::bigint as void_count,
           coalesce(sum(net_total),0)::numeric as void_amount
    from filtered_sales
    where upper(status::text) = 'VOIDED'
  ),
  return_summary as (
    select count(*)::bigint as return_count,
           coalesce(sum(sr.refund_amount),0)::numeric as return_amount
    from public.sales_returns sr
    where sr.created_at >= v_start
      and sr.created_at < v_end
      and (p_branch_id is null or sr.branch_id = p_branch_id)
      and upper(sr.status::text) <> 'VOIDED'
  ),
  bills as (
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) as rows
    from (
      select
        s.id,
        s.sale_no,
        s.created_at,
        s.branch_id,
        s.status::text as status,
        s.payment_method::text as payment_method,
        s.subtotal,
        s.discount_amount,
        s.net_total,
        s.received_amount,
        s.change_amount,
        s.customer_name,
        s.customer_phone
      from filtered_sales s
      order by s.created_at desc
      limit greatest(1, least(coalesce(p_limit,100),500))
    ) x
  ),
  items as (
    select jsonb_agg(to_jsonb(x) order by x.sale_id, x.product_name) as rows
    from (
      select
        rb.sale_id,
        rb.product_id,
        rb.product_code,
        rb.barcode,
        rb.product_name,
        rb.sold_quantity,
        rb.returned_quantity,
        rb.returnable_quantity,
        rb.unit_price,
        (rb.sold_quantity * rb.unit_price)::numeric as line_amount
      from public.sale_item_return_balance rb
      join filtered_sales fs on fs.id = rb.sale_id
    ) x
  ),
  trend as (
    select jsonb_agg(to_jsonb(x) order by x.bucket_date) as rows
    from (
      select
        case
          when v_period = 'YEAR' then date_trunc('month', s.created_at)::date
          else s.created_at::date
        end as bucket_date,
        count(*)::bigint as bill_count,
        coalesce(sum(case when upper(s.status::text) <> 'VOIDED' then s.net_total else 0 end),0)::numeric as revenue
      from filtered_sales s
      group by 1
      order by 1
    ) x
  )
  select jsonb_build_object(
    'period', jsonb_build_object('type',v_period,'start',v_start,'end',v_end),
    'summary', (select to_jsonb(summary) from summary),
    'voids', (select to_jsonb(void_summary) from void_summary),
    'returns', (select to_jsonb(return_summary) from return_summary),
    'bills', coalesce((select rows from bills),'[]'::jsonb),
    'items', coalesce((select rows from items),'[]'::jsonb),
    'trend', coalesce((select rows from trend),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_sales_control_dashboard_v2_1(text,date,uuid,integer) from public;
grant execute on function public.get_sales_control_dashboard_v2_1(text,date,uuid,integer) to authenticated;

commit;
