-- TKN POS / ERP — Phase 9.2
-- Module 2.6.2 Final: Process Sale Return + Restock
--
-- Uses:
--   sales
--   sale_items
--   sales_returns
--   sales_return_items
--   branch_inventory
--   stock_documents
--   stock_movements
--
-- All writes run in one PostgreSQL transaction.
-- If any step fails, the whole return is rolled back.

begin;

create or replace function public.process_sale_return_phase_9_2(
  p_sale_id uuid,
  p_reason text,
  p_refund_method text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales%rowtype;
  v_reason text;
  v_refund_method_text text;
  v_return_id uuid;
  v_return_no text;
  v_stock_document_id uuid;
  v_stock_document_no text;
  v_line jsonb;
  v_sale_item public.sale_items%rowtype;
  v_requested_qty numeric;
  v_returned_qty numeric;
  v_returnable_qty numeric;
  v_line_refund numeric;
  v_total_refund numeric := 0;
  v_total_return_qty numeric := 0;
  v_before numeric;
  v_after numeric;
  v_total_sold numeric;
  v_total_returned_after numeric;
  v_new_sale_status text;
  v_member_id uuid;
begin
  v_reason := btrim(coalesce(p_reason, ''));

  if length(v_reason) < 5 then
    raise exception 'RETURN_REASON_TOO_SHORT';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'RETURN_ITEMS_REQUIRED';
  end if;

  -- Lock the sale to prevent concurrent void/return operations.
  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'SALE_NOT_FOUND';
  end if;

  if upper(v_sale.status::text) in ('VOIDED', 'CANCELLED') then
    raise exception 'VOIDED_SALE_CANNOT_BE_RETURNED';
  end if;

  if upper(v_sale.status::text) = 'RETURNED' then
    raise exception 'SALE_ALREADY_FULLY_RETURNED';
  end if;

  -- ORIGINAL means refund through the original payment method.
  v_refund_method_text :=
    case
      when upper(coalesce(p_refund_method, 'ORIGINAL')) = 'ORIGINAL'
        then upper(v_sale.payment_method::text)
      else upper(btrim(p_refund_method))
    end;

  -- Validate all requested lines before inserting anything.
  for v_line in
    select value
    from jsonb_array_elements(p_items)
  loop
    if nullif(v_line->>'sale_item_id', '') is null then
      raise exception 'SALE_ITEM_ID_REQUIRED';
    end if;

    v_requested_qty := coalesce((v_line->>'quantity')::numeric, 0);

    if v_requested_qty <= 0 then
      raise exception 'RETURN_QUANTITY_MUST_BE_POSITIVE';
    end if;

    select *
    into v_sale_item
    from public.sale_items
    where id = (v_line->>'sale_item_id')::uuid
      and sale_id = p_sale_id
    for update;

    if not found then
      raise exception 'SALE_ITEM_NOT_FOUND_OR_NOT_IN_SALE';
    end if;

    select coalesce(sum(sri.quantity), 0)
    into v_returned_qty
    from public.sales_return_items sri
    join public.sales_returns sr
      on sr.id = sri.return_id
    where sri.sale_item_id = v_sale_item.id
      and upper(sr.status::text) <> 'VOIDED';

    v_returnable_qty :=
      coalesce(v_sale_item.quantity, 0) - coalesce(v_returned_qty, 0);

    if v_requested_qty > v_returnable_qty then
      raise exception
        'RETURN_QUANTITY_EXCEEDS_BALANCE: sale_item %, requested %, available %',
        v_sale_item.id,
        v_requested_qty,
        v_returnable_qty;
    end if;
  end loop;

  -- Generate unique return number.
  v_return_no :=
    'RT'
    || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISSMS')
    || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  v_stock_document_no := 'RETURN-' || v_return_no;

  -- member_id may not exist in every historical sales schema.
  begin
    v_member_id := nullif(to_jsonb(v_sale)->>'member_id', '')::uuid;
  exception
    when others then
      v_member_id := null;
  end;

  -- Validate refund enum before writing.
  begin
    perform v_refund_method_text::public.refund_method;
  exception
    when invalid_text_representation then
      raise exception
        'UNSUPPORTED_REFUND_METHOD: %',
        v_refund_method_text;
  end;

  insert into public.sales_returns (
    return_no,
    sale_id,
    branch_id,
    member_id,
    status,
    refund_method,
    refund_amount,
    points_reversed,
    reason,
    notes,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_return_no,
    p_sale_id,
    v_sale.branch_id,
    v_member_id,
    'COMPLETED',
    v_refund_method_text::public.refund_method,
    0,
    0,
    v_reason,
    'สร้างจาก Phase 9.2 Sales Return',
    auth.uid(),
    now(),
    now()
  )
  returning id into v_return_id;

  insert into public.stock_documents (
    document_no,
    document_type,
    status,
    reference_no,
    notes,
    created_by,
    posted_by,
    created_at,
    posted_at,
    updated_at
  )
  values (
    v_stock_document_no,
    'RECEIVE',
    'POSTED',
    v_return_no,
    concat(
      'รับคืนสินค้าจากบิล ',
      v_sale.sale_no,
      ' | ใบคืน ',
      v_return_no,
      ' | เหตุผล: ',
      v_reason
    ),
    auth.uid(),
    auth.uid(),
    now(),
    now(),
    now()
  )
  returning id into v_stock_document_id;

  -- Insert each return line and restore stock.
  for v_line in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_requested_qty := (v_line->>'quantity')::numeric;

    select *
    into v_sale_item
    from public.sale_items
    where id = (v_line->>'sale_item_id')::uuid
      and sale_id = p_sale_id
    for update;

    v_line_refund :=
      round(
        v_requested_qty * coalesce(v_sale_item.unit_price, 0),
        2
      );

    insert into public.sales_return_items (
      return_id,
      sale_item_id,
      product_id,
      quantity,
      unit_price,
      refund_amount,
      product_code_snapshot,
      barcode_snapshot,
      product_name_snapshot,
      created_at
    )
    values (
      v_return_id,
      v_sale_item.id,
      v_sale_item.product_id,
      v_requested_qty,
      coalesce(v_sale_item.unit_price, 0),
      v_line_refund,
      v_sale_item.product_code_snapshot,
      v_sale_item.barcode_snapshot,
      v_sale_item.product_name_snapshot,
      now()
    );

    -- Lock and restore branch inventory.
    select bi.quantity
    into v_before
    from public.branch_inventory bi
    where bi.branch_id = v_sale.branch_id
      and bi.product_id = v_sale_item.product_id
    for update;

    if found then
      v_after := coalesce(v_before, 0) + v_requested_qty;

      update public.branch_inventory
      set
        quantity = v_after,
        updated_at = now()
      where branch_id = v_sale.branch_id
        and product_id = v_sale_item.product_id;
    else
      v_before := 0;
      v_after := v_requested_qty;

      insert into public.branch_inventory (
        branch_id,
        product_id,
        quantity,
        minimum_stock,
        updated_at
      )
      values (
        v_sale.branch_id,
        v_sale_item.product_id,
        v_after,
        0,
        now()
      );
    end if;

    insert into public.stock_movements (
      document_id,
      product_id,
      quantity_change,
      quantity_before,
      quantity_after,
      line_note,
      created_by,
      created_at
    )
    values (
      v_stock_document_id,
      v_sale_item.product_id,
      v_requested_qty,
      v_before,
      v_after,
      concat(
        'คืนสินค้าจากบิล ',
        v_sale.sale_no,
        ' | ',
        v_return_no
      ),
      auth.uid(),
      now()
    );

    v_total_return_qty :=
      v_total_return_qty + v_requested_qty;

    v_total_refund :=
      v_total_refund + v_line_refund;
  end loop;

  update public.sales_returns
  set
    refund_amount = v_total_refund,
    updated_at = now()
  where id = v_return_id;

  -- Determine whether the sale is partially or fully returned.
  select coalesce(sum(si.quantity), 0)
  into v_total_sold
  from public.sale_items si
  where si.sale_id = p_sale_id;

  select coalesce(sum(sri.quantity), 0)
  into v_total_returned_after
  from public.sales_return_items sri
  join public.sales_returns sr
    on sr.id = sri.return_id
  where sr.sale_id = p_sale_id
    and upper(sr.status::text) <> 'VOIDED';

  v_new_sale_status :=
    case
      when v_total_returned_after >= v_total_sold
        then 'RETURNED'
      else 'PARTIAL_RETURN'
    end;

  update public.sales
  set
    status = v_new_sale_status,
    notes = concat_ws(
      E'\n',
      nullif(notes, ''),
      concat(
        '[RETURN ',
        v_return_no,
        '] ',
        v_reason,
        ' | Refund ',
        v_total_refund
      )
    )
  where id = p_sale_id;

  -- Optional audit log: differences in audit schema must not break the return.
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
      'PROCESS_SALE_RETURN',
      'SALE_RETURN',
      v_return_id,
      jsonb_build_object(
        'return_no', v_return_no,
        'sale_id', p_sale_id,
        'sale_no', v_sale.sale_no,
        'refund_method', v_refund_method_text,
        'refund_amount', v_total_refund,
        'return_quantity', v_total_return_qty,
        'new_sale_status', v_new_sale_status,
        'stock_document_id', v_stock_document_id,
        'stock_document_no', v_stock_document_no
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
    'return_id', v_return_id,
    'return_no', v_return_no,
    'sale_id', p_sale_id,
    'sale_no', v_sale.sale_no,
    'refund_method', v_refund_method_text,
    'refund_amount', v_total_refund,
    'return_quantity', v_total_return_qty,
    'sale_status', v_new_sale_status,
    'stock_restored', true,
    'stock_document_id', v_stock_document_id,
    'stock_document_no', v_stock_document_no
  );
end;
$$;

revoke all on function public.process_sale_return_phase_9_2(
  uuid, text, text, jsonb
) from public;

grant execute on function public.process_sale_return_phase_9_2(
  uuid, text, text, jsonb
) to authenticated;

commit;
