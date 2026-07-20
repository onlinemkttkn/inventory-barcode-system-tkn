-- TKN POS / ERP — Phase 9.2
-- Module 2.5: Void Bill (Safe Foundation)
--
-- Current scope:
-- - validate bill exists
-- - prevent duplicate void
-- - require reason
-- - update sales.status to VOIDED
-- - set voided_by when available
-- - write audit log when compatible
--
-- IMPORTANT:
-- Stock restoration is intentionally NOT included yet.
-- We must map stock_movements / inventory tables first.

begin;

create or replace function public.void_sale_phase_9_2(
  p_sale_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales%rowtype;
  v_reason text;
begin
  v_reason := btrim(coalesce(p_reason, ''));

  if length(v_reason) < 5 then
    raise exception 'VOID_REASON_TOO_SHORT';
  end if;

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'SALE_NOT_FOUND';
  end if;

  if upper(v_sale.status::text) = 'VOIDED' then
    raise exception 'SALE_ALREADY_VOIDED';
  end if;

  update public.sales
  set
    status = 'VOIDED',
    voided_by = auth.uid(),
    notes = concat_ws(
      E'\n',
      nullif(notes, ''),
      '[VOID] ' || v_reason
    )
  where id = p_sale_id;

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
      'VOID_SALE',
      'SALE',
      p_sale_id,
      jsonb_build_object(
        'sale_no', v_sale.sale_no,
        'reason', v_reason,
        'previous_status', v_sale.status::text,
        'stock_restored', false,
        'source', 'PHASE_9_2_SEARCH_BILL'
      ),
      auth.uid(),
      now()
    );
  exception
    when undefined_column or undefined_table then
      null;
  end;

  return jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'sale_no', v_sale.sale_no,
    'status', 'VOIDED',
    'stock_restored', false
  );
end;
$$;

revoke all on function public.void_sale_phase_9_2(uuid, text) from public;
grant execute on function public.void_sale_phase_9_2(uuid, text) to authenticated;

commit;

-- Validation only:
-- select public.void_sale_phase_9_2(
--   'PUT_TEST_SALE_UUID_HERE',
--   'ยกเลิกเพื่อทดสอบระบบ'
-- );
