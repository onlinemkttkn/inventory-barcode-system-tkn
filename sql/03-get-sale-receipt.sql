begin;

create or replace function public.get_sale_receipt_phase_9_2(
  p_sale_id uuid
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
          s.id,
          s.sale_no,
          s.status::text as status,
          s.subtotal,
          s.discount_amount,
          s.net_total,
          s.payment_method::text as payment_method,
          s.received_amount,
          s.change_amount,
          s.customer_name,
          s.customer_phone,
          s.notes,
          s.created_at
        from public.sales s
        where s.id = p_sale_id
      ) h
    ),
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', si.id,
            'product_id', si.product_id,
            'quantity', si.quantity,
            'unit_price', si.unit_price,
            'discount_amount', si.discount_amount,
            'line_total', si.line_total,
            'product_code_snapshot', si.product_code_snapshot,
            'barcode_snapshot', si.barcode_snapshot,
            'product_name_snapshot', si.product_name_snapshot
          )
          order by si.created_at asc
        )
        from public.sale_items si
        where si.sale_id = p_sale_id
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.get_sale_receipt_phase_9_2(uuid) from public;
grant execute on function public.get_sale_receipt_phase_9_2(uuid) to authenticated;

commit;
