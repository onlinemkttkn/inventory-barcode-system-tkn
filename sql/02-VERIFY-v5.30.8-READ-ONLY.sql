-- TKN v5.30.8 VERIFY — READ ONLY
select 'v5.30.8 atomic box commit RPC' check_name,
case when to_regprocedure('public.tkn_v5308_commit_box_to_waiting(text,jsonb,text,text,text)') is not null
then 'PASS' else 'FAIL' end result
union all
select 'v5.28.3 waiting snapshot',
case when to_regprocedure('public.tkn_v5283_close_box_to_waiting(text,uuid,text,text,text)') is not null
then 'PASS' else 'FAIL' end
union all
select 'warehouse configured',
case when public.tkn_v5300_warehouse_branch_id() is not null then 'PASS' else 'FAIL' end;

-- Diagnostic: local-looking codes that exist in DB and latest workflow.
select b.box_code,b.status,b.closed_at,h.workflow_status,h.revision
from public.stock_boxes b
left join lateral(
  select workflow_status,revision
  from public.tkn_box_history h
  where h.box_id=b.id
  order by revision desc limit 1
) h on true
where upper(b.box_code) like 'TKN-B-%'
order by b.closed_at desc nulls last
limit 50;


-- หลัง UAT ปิดกล่องสำเร็จ ใช้ query นี้ยืนยันว่า 3 ชั้นมีข้อมูลตรงกัน
-- เปลี่ยน TKN-B-MIX-A02 เป็นรหัสกล่องที่ทดสอบ
select
  b.box_code,
  b.status as box_status,
  count(i.id) filter(where i.quantity>0) as item_rows,
  coalesce(sum(i.quantity) filter(where i.quantity>0),0) as total_quantity,
  h.id as history_id,
  h.workflow_status
from public.stock_boxes b
left join public.stock_box_items i on i.box_id=b.id
left join lateral(
  select id,workflow_status
  from public.tkn_box_history h
  where h.box_id=b.id
  order by revision desc limit 1
) h on true
where upper(b.box_code)=upper('TKN-B-MIX-A02')
group by b.id,b.box_code,b.status,h.id,h.workflow_status;
