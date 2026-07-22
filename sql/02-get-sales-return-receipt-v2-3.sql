begin;

create or replace function public.get_sales_return_receipt_phase_9_2(
  p_return_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'header',
    (
      select to_jsonb(h)
      from (
        select
          sr.id as return_id, sr.return_no, sr.sale_id, s.sale_no,
          sr.branch_id, sr.member_id, sr.status::text as status,
          sr.refund_method::text as refund_method, sr.refund_amount,
          sr.points_reversed, sr.reason, sr.notes, sr.created_by,
          sr.created_at, s.customer_name, s.customer_phone
        from public.sales_returns sr
        join public.sales s on s.id = sr.sale_id
        where sr.id = p_return_id
      ) h
    ),
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', sri.id,
            'sale_item_id', sri.sale_item_id,
            'product_id', sri.product_id,
            'quantity', sri.quantity,
            'unit_price', sri.unit_price,
            'refund_amount', sri.refund_amount,
            'product_code_snapshot', sri.product_code_snapshot,
            'barcode_snapshot', sri.barcode_snapshot,
            'product_name_snapshot', sri.product_name_snapshot
          )
          order by sri.created_at asc
        )
        from public.sales_return_items sri
        where sri.return_id = p_return_id
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.get_sales_return_receipt_phase_9_2(uuid) from public;
grant execute on function public.get_sales_return_receipt_phase_9_2(uuid) to authenticated;

commit;
