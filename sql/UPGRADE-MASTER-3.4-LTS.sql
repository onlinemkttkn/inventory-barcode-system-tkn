-- MASTER 3.4 LTS FINAL - Reports by payment channel
begin;

create or replace function public.get_sales_control_dashboard_range_v3_4(
  p_start_date date,p_end_date date,p_branch_id uuid default null,p_limit integer default 500
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_start timestamptz;v_end timestamptz;v_result jsonb;
begin
  if p_start_date is null or p_end_date is null then raise exception 'กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุด'; end if;
  if p_end_date<p_start_date then raise exception 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น'; end if;
  if p_end_date-p_start_date>366 then raise exception 'ช่วงรายงานต้องไม่เกิน 366 วัน'; end if;
  if not(public.user_has_permission('report.view'::text,auth.uid()) or public.user_has_permission('dashboard.view'::text,auth.uid()) or public.user_has_permission('dashboard.branch_view'::text,auth.uid())) then raise exception 'ไม่มีสิทธิ์ดูรายงาน'; end if;
  v_start:=p_start_date::timestamp;v_end:=(p_end_date+1)::timestamp;
  with filtered_sales as(
    select s.* from public.sales s where s.created_at>=v_start and s.created_at<v_end and(p_branch_id is null or s.branch_id=p_branch_id)
  ),active_sales as(select * from filtered_sales where upper(status::text)<>'VOIDED'),
  summary as(
    select count(*)::bigint bill_count,coalesce(sum(net_total),0)::numeric gross_revenue,
      coalesce(sum(case when upper(payment_method::text)='CASH' then net_total else 0 end),0)::numeric cash_revenue,
      coalesce(sum(case when upper(payment_method::text)='QR' then net_total else 0 end),0)::numeric qr_revenue,
      coalesce(sum(case when upper(payment_method::text)='TRANSFER' then net_total else 0 end),0)::numeric transfer_revenue,
      coalesce(sum(case when upper(payment_method::text)='CARD' then net_total else 0 end),0)::numeric card_revenue,
      coalesce(sum(case when upper(payment_method::text)='VOUCHER' then net_total else 0 end),0)::numeric voucher_revenue,
      coalesce(sum(case when upper(payment_method::text) not in('CASH','QR','TRANSFER','CARD','VOUCHER') then net_total else 0 end),0)::numeric other_revenue,
      coalesce(sum(case when upper(payment_method::text) in('QR','TRANSFER') then net_total else 0 end),0)::numeric qr_transfer_revenue,
      coalesce(avg(net_total),0)::numeric average_bill from active_sales
  ),void_summary as(select count(*)::bigint void_count,coalesce(sum(net_total),0)::numeric void_amount from filtered_sales where upper(status::text)='VOIDED'),
  return_summary as(select count(*)::bigint return_count,coalesce(sum(sr.refund_amount),0)::numeric return_amount from public.sales_returns sr where sr.created_at>=v_start and sr.created_at<v_end and(p_branch_id is null or sr.branch_id=p_branch_id) and upper(sr.status::text)<>'VOIDED'),
  bills as(select jsonb_agg(to_jsonb(x) order by x.created_at desc) rows from(select s.id,s.sale_no,s.created_at,s.branch_id,s.status::text status,s.payment_method::text payment_method,s.subtotal,s.discount_amount,s.net_total,s.received_amount,s.change_amount,s.customer_name,s.customer_phone from filtered_sales s order by s.created_at desc limit greatest(1,least(coalesce(p_limit,500),1000)))x),
  items as(select jsonb_agg(to_jsonb(x) order by x.sale_id,x.product_name) rows from(select rb.sale_id,rb.product_id,rb.product_code,rb.barcode,rb.product_name,rb.sold_quantity,rb.returned_quantity,rb.returnable_quantity,rb.unit_price,(rb.sold_quantity*rb.unit_price)::numeric line_amount from public.sale_item_return_balance rb join filtered_sales fs on fs.id=rb.sale_id)x)
  select jsonb_build_object('period',jsonb_build_object('type','RANGE','start',v_start,'end',v_end),'summary',(select to_jsonb(summary)from summary),'voids',(select to_jsonb(void_summary)from void_summary),'returns',(select to_jsonb(return_summary)from return_summary),'bills',coalesce((select rows from bills),'[]'::jsonb),'items',coalesce((select rows from items),'[]'::jsonb),'trend','[]'::jsonb) into v_result;
  return v_result;
end;$$;
revoke all on function public.get_sales_control_dashboard_range_v3_4(date,date,uuid,integer) from public;
grant execute on function public.get_sales_control_dashboard_range_v3_4(date,date,uuid,integer) to authenticated;
commit;
