-- TKN POS ERP v5.25.12
-- เบิกสินค้าทั้งกล่องไปขายหน้าร้าน โดยไม่ลด branch_inventory
-- หลังเบิก: ล้างรายการปัจจุบันใน stock_box_items และเปิดกล่องเป็น DRAFT
-- ประวัติรายการที่เบิกถูกเก็บใน container_audit_log.detail

begin;

create or replace function public.issue_box_to_storefront(
  p_box_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ctx jsonb;
  v_box public.stock_boxes%rowtype;
  v_items jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_user_branch uuid;
  v_box_branch uuid;
  v_has_branch_column boolean := false;
begin
  v_ctx := public.current_access_context();

  if not coalesce((v_ctx->>'is_active')::boolean, false) then
    raise exception 'บัญชีไม่มีสิทธิ์หรือถูกปิดใช้งาน';
  end if;

  if not (
    coalesce(v_ctx->'permissions', '[]'::jsonb) ? 'inventory.issue'
    or coalesce(v_ctx->'permissions', '[]'::jsonb) ? 'product.manage'
  ) then
    raise exception 'ไม่มีสิทธิ์เบิกสินค้า';
  end if;

  if nullif(btrim(p_box_code), '') is null then
    raise exception 'กรุณาระบุรหัสกล่อง';
  end if;

  select *
  into v_box
  from public.stock_boxes
  where upper(box_code) = upper(btrim(p_box_code))
  for update;

  if not found then
    raise exception 'ไม่พบกล่อง %', p_box_code;
  end if;

  if upper(coalesce(v_box.status::text, '')) <> 'CLOSED' then
    raise exception 'ต้องปิดกล่องให้เรียบร้อยก่อนจึงจะเบิกได้';
  end if;

  select exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_boxes'
      and column_name = 'branch_id'
  ) into v_has_branch_column;

  if v_has_branch_column then
    v_user_branch := nullif(v_ctx->>'branch_id', '')::uuid;
    execute 'select branch_id from public.stock_boxes where id = $1'
      into v_box_branch using v_box.id;
    if v_user_branch is not null
       and v_box_branch is not null
       and v_user_branch <> v_box_branch then
      raise exception 'กล่องนี้อยู่คนละสาขากับผู้ใช้งาน';
    end if;
  end if;

  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'product_id', i.product_id,
        'sku', i.sku,
        'quantity', i.quantity,
        'product_code', coalesce(p.product_code, i.sku),
        'product_name', coalesce(p.name, i.sku),
        'barcode', p.barcode
      ) order by i.sku
    ), '[]'::jsonb),
    coalesce(sum(i.quantity), 0)
  into v_items, v_total
  from public.stock_box_items i
  left join public.products p on p.id = i.product_id
  where i.box_id = v_box.id
    and i.quantity > 0;

  if v_total <= 0 or jsonb_array_length(v_items) = 0 then
    raise exception 'กล่องนี้ไม่มีสินค้าให้เบิก';
  end if;

  -- นำสินค้าออกจากตำแหน่งกล่องเท่านั้น ไม่ตัดยอดสต็อกสาขา
  delete from public.stock_box_items
  where box_id = v_box.id;

  -- กล่องว่างและพร้อมใช้สแกนสินค้าเข้ารอบใหม่
  update public.stock_boxes
  set status = 'DRAFT',
      closed_at = null
  where id = v_box.id
  returning * into v_box;

  -- เก็บ snapshot เพื่อดูย้อนหลังว่าเบิกอะไรออกจากกล่อง
  begin
    insert into public.container_audit_log(
      action,
      reference_code,
      detail,
      user_id
    ) values (
      'BOX_ISSUE_TO_STOREFRONT',
      v_box.box_code,
      jsonb_build_object(
        'message', 'เบิกสินค้าทั้งกล่องไปขายหน้าร้าน',
        'previous_status', 'CLOSED',
        'new_status', 'DRAFT',
        'total_sku', jsonb_array_length(v_items),
        'total_quantity', v_total,
        'items', v_items,
        'issued_at', now()
      ),
      auth.uid()
    );
  exception when others then
    -- Audit เป็นข้อมูลเสริม ไม่ให้ทำให้รายการหลักล้มเหลว
    null;
  end;

  return jsonb_build_object(
    'box', jsonb_build_object(
      'id', v_box.id,
      'box_code', v_box.box_code,
      'status', v_box.status,
      'location_text', v_box.location_text
    ),
    'items', v_items,
    'total_sku', jsonb_array_length(v_items),
    'total_quantity', v_total,
    'issued_at', now()
  );
end;
$$;

revoke all on function public.issue_box_to_storefront(text) from public, anon;
grant execute on function public.issue_box_to_storefront(text) to authenticated;

comment on function public.issue_box_to_storefront(text) is
  'เบิกสินค้าทั้งกล่องไปหน้าร้าน: ไม่ลด branch_inventory, ล้างตำแหน่งกล่อง, เปิดกล่องเป็น DRAFT และบันทึก snapshot';

commit;
