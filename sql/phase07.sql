-- ============================================================
-- PHASE 07: INVENTORY OPERATIONS
-- รับเข้า / เบิกจ่าย / ประวัติการเคลื่อนไหว
-- ต้องรันหลัง Phase 1-6.5
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.products') is null then
    raise exception 'ไม่พบ public.products กรุณารัน Phase 1 ก่อน';
  end if;

  if to_regclass('public.profiles') is null then
    raise exception 'ไม่พบ public.profiles กรุณารัน Phase 4 ก่อน';
  end if;

  if to_regclass('public.stock_documents') is null then
    raise exception 'ไม่พบ public.stock_documents กรุณารัน Phase 5 ก่อน';
  end if;

  if to_regclass('public.stock_movements') is null then
    raise exception 'ไม่พบ public.stock_movements กรุณารัน Phase 5 ก่อน';
  end if;
end;
$$;

-- ข้อมูลผู้ขาย/ผู้เบิกในเอกสาร
alter table public.stock_documents
  add column if not exists supplier_name text,
  add column if not exists requester_name text,
  add column if not exists department text;

-- View สำหรับหน้าเว็บ
create or replace view public.inventory_transaction_list
with (security_invoker = true)
as
select
  sd.id,
  sd.document_no,
  sd.document_type,
  sd.status,
  sd.reference_no,
  sd.supplier_name,
  sd.requester_name,
  sd.department,
  sd.notes,
  sd.created_at,
  sd.posted_at,
  p.email as created_by_email,
  p.full_name as created_by_name,
  count(sm.id) as total_lines,
  coalesce(sum(abs(sm.quantity_change)), 0) as total_quantity
from public.stock_documents sd
left join public.stock_movements sm on sm.document_id = sd.id
left join public.profiles p on p.id = sd.created_by
group by
  sd.id,
  p.email,
  p.full_name;

grant select on public.inventory_transaction_list to authenticated;
revoke all on public.inventory_transaction_list from anon;

-- ฟังก์ชันรับสินค้าเข้า
create or replace function public.receive_inventory(
  p_items jsonb,
  p_supplier_name text default null,
  p_reference_no text default null,
  p_notes text default null
)
returns public.stock_documents
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_doc public.stock_documents;
begin
  if not public.is_active_user() then
    raise exception 'บัญชีไม่มีสิทธิ์หรือถูกปิดใช้งาน';
  end if;

  v_doc := public.create_stock_document(
    'RECEIVE',
    p_items,
    p_reference_no,
    p_notes
  );

  update public.stock_documents
  set supplier_name = nullif(trim(p_supplier_name), '')
  where id = v_doc.id
  returning * into v_doc;

  return v_doc;
end;
$$;

-- ฟังก์ชันเบิก/จ่ายสินค้า
create or replace function public.issue_inventory(
  p_items jsonb,
  p_requester_name text,
  p_department text default null,
  p_reference_no text default null,
  p_notes text default null
)
returns public.stock_documents
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_doc public.stock_documents;
begin
  if not public.is_active_user() then
    raise exception 'บัญชีไม่มีสิทธิ์หรือถูกปิดใช้งาน';
  end if;

  if nullif(trim(p_requester_name), '') is null then
    raise exception 'กรุณาระบุชื่อผู้เบิก';
  end if;

  v_doc := public.create_stock_document(
    'ISSUE',
    p_items,
    p_reference_no,
    p_notes
  );

  update public.stock_documents
  set
    requester_name = trim(p_requester_name),
    department = nullif(trim(p_department), '')
  where id = v_doc.id
  returning * into v_doc;

  return v_doc;
end;
$$;

grant execute on function public.receive_inventory(jsonb,text,text,text) to authenticated;
grant execute on function public.issue_inventory(jsonb,text,text,text,text) to authenticated;

revoke execute on function public.receive_inventory(jsonb,text,text,text) from anon;
revoke execute on function public.issue_inventory(jsonb,text,text,text,text) from anon;

insert into public.system_migrations (phase, description)
values (
  'PHASE_07',
  'เพิ่มระบบรับสินค้าเข้า เบิกจ่าย และหน้าประวัติการเคลื่อนไหว'
)
on conflict (phase) do update
set description = excluded.description,
    executed_at = now();

commit;
