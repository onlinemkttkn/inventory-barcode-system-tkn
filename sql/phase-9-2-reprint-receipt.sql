-- TKN POS / ERP — Phase 9.2
-- Module 2.4: Reprint Receipt RPC + Audit
-- Uses existing: sales, sale_items, audit_logs
-- Does not modify sale data.

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

create or replace function public.log_receipt_reprint_phase_9_2(
  p_sale_id uuid,
  p_sale_no text default null,
  p_paper_size integer default 80
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
begin
  insert into public.audit_logs (
    action,
    entity_type,
    entity_id,
    details,
    created_by,
    created_at
  )
  values (
    'REPRINT_RECEIPT',
    'SALE',
    p_sale_id,
    jsonb_build_object(
      'sale_no', p_sale_no,
      'paper_size_mm', p_paper_size,
      'source', 'PHASE_9_2_SEARCH_BILL'
    ),
    auth.uid(),
    now()
  )
  returning id into v_log_id;

  return v_log_id;
exception
  when undefined_column then
    -- If audit_logs schema differs, do not block receipt printing.
    return null;
  when undefined_table then
    return null;
end;
$$;

revoke all on function public.log_receipt_reprint_phase_9_2(
  uuid, text, integer
) from public;

grant execute on function public.log_receipt_reprint_phase_9_2(
  uuid, text, integer
) to authenticated;

commit;

-- Validation example:
-- select public.get_sale_receipt_phase_9_2('PUT_REAL_SALE_UUID_HERE');
