begin;

create or replace function public.get_sale_items_phase_9_2(
  p_sale_id uuid
)
returns table (
  id uuid,
  sale_id uuid,
  product_id uuid,
  quantity numeric,
  unit_price numeric,
  discount_amount numeric,
  line_total numeric,
  product_code_snapshot text,
  barcode_snapshot text,
  product_name_snapshot text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    si.id,
    si.sale_id,
    si.product_id,
    si.quantity,
    si.unit_price,
    si.discount_amount,
    si.line_total,
    si.product_code_snapshot,
    si.barcode_snapshot,
    si.product_name_snapshot,
    si.created_at
  from public.sale_items si
  where si.sale_id = p_sale_id
  order by si.created_at asc;
$$;

revoke all on function public.get_sale_items_phase_9_2(uuid) from public;
grant execute on function public.get_sale_items_phase_9_2(uuid) to authenticated;

commit;
