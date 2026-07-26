-- ============================================================================
-- PHASE 07.6C : RECEIVE / ISSUE PERMISSION HARDENING
-- ใช้หลัง PHASE-07-6A-INVENTORY-LINKING.sql
-- เป้าหมาย:
--   1) ตรวจ inventory.receive / inventory.issue ใน RPC จริง
--   2) ปิด generic RPC และ RPC รุ่นเก่าจากหน้าเว็บ
--   3) เปิดเฉพาะ receive_branch_inventory / issue_branch_inventory
-- ============================================================================

begin;

create or replace function public.receive_branch_inventory(
  p_branch_id uuid,
  p_items jsonb,
  p_supplier_name text default null,
  p_reference_no text default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns public.stock_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.stock_documents;
  v_ctx jsonb;
begin
  v_ctx := public.current_access_context();

  if not coalesce((v_ctx->>'is_active')::boolean, false) then
    raise exception 'บัญชีไม่มีสิทธิ์หรือถูกปิดใช้งาน';
  end if;

  if not (coalesce(v_ctx->'permissions', '[]'::jsonb) ? 'inventory.receive') then
    raise exception 'ไม่มีสิทธิ์รับสินค้า';
  end if;

  v_doc := public.create_branch_stock_document(
    p_branch_id,
    'RECEIVE',
    p_items,
    p_reference_no,
    p_notes,
    'STOCK_RECEIVE',
    null,
    null,
    p_idempotency_key
  );

  update public.stock_documents
  set supplier_name = nullif(btrim(p_supplier_name), '')
  where id = v_doc.id
  returning * into v_doc;

  return v_doc;
end;
$$;

create or replace function public.issue_branch_inventory(
  p_branch_id uuid,
  p_items jsonb,
  p_requester_name text,
  p_department text default null,
  p_reference_no text default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns public.stock_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.stock_documents;
  v_ctx jsonb;
begin
  v_ctx := public.current_access_context();

  if not coalesce((v_ctx->>'is_active')::boolean, false) then
    raise exception 'บัญชีไม่มีสิทธิ์หรือถูกปิดใช้งาน';
  end if;

  if not (coalesce(v_ctx->'permissions', '[]'::jsonb) ? 'inventory.issue') then
    raise exception 'ไม่มีสิทธิ์เบิกสินค้า';
  end if;

  if nullif(btrim(p_requester_name), '') is null then
    raise exception 'กรุณาระบุชื่อผู้เบิก';
  end if;

  v_doc := public.create_branch_stock_document(
    p_branch_id,
    'ISSUE',
    p_items,
    p_reference_no,
    p_notes,
    'STOCK_ISSUE',
    null,
    null,
    p_idempotency_key
  );

  update public.stock_documents
  set requester_name = btrim(p_requester_name),
      department = nullif(btrim(p_department), '')
  where id = v_doc.id
  returning * into v_doc;

  return v_doc;
end;
$$;

-- Generic helper ให้ RPC ภายในเรียกเท่านั้น ไม่เปิดให้ Browser เรียกตรง
revoke execute on function public.create_branch_stock_document(
  uuid,text,jsonb,text,text,text,uuid,text,text
) from public, anon, authenticated;

-- หน้าเว็บรุ่น 07.6C ไม่ใช้ default BR001 อีกต่อไป
revoke execute on function public.receive_inventory(
  jsonb,text,text,text
) from public, anon, authenticated;

revoke execute on function public.issue_inventory(
  jsonb,text,text,text,text
) from public, anon, authenticated;

revoke execute on function public.receive_branch_inventory(
  uuid,jsonb,text,text,text,text
) from public, anon;

grant execute on function public.receive_branch_inventory(
  uuid,jsonb,text,text,text,text
) to authenticated;

revoke execute on function public.issue_branch_inventory(
  uuid,jsonb,text,text,text,text,text
) from public, anon;

grant execute on function public.issue_branch_inventory(
  uuid,jsonb,text,text,text,text,text
) to authenticated;

commit;
