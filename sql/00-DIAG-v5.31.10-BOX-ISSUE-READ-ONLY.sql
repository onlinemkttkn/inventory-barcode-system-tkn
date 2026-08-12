-- TKN v5.31.10 — BOX ISSUE DIAGNOSTIC (READ ONLY)
-- ไม่มี INSERT / UPDATE / DELETE / TRUNCATE / ALTER / DROP
-- เปลี่ยนรหัสกล่องที่ CTE params ได้หากต้องการตรวจกล่องอื่น

with params as (
  select 'TKN-B-MIX-A03'::text as box_code
), latest_history as (
  select distinct on (h.box_id)
    h.id as history_id,h.box_id,h.box_code,h.revision,h.workflow_status,
    h.category_text,h.zone_code,h.sku_count,h.total_quantity,h.updated_at
  from public.tkn_box_history h
  join params p on upper(h.box_code)=upper(p.box_code)
  order by h.box_id,h.revision desc,h.created_at desc
)
select
  b.box_code,
  b.status as box_status,
  t.branch_id,
  br.code as branch_code,
  br.name as branch_name,
  t.location_state,
  t.active_transfer_id,
  h.revision,
  h.workflow_status,
  h.category_text,
  h.zone_code,
  h.sku_count as history_sku_count,
  h.total_quantity as history_total_quantity,
  case
    when upper(coalesce(b.status::text,'')) <> 'CLOSED' then 'BLOCK: BOX_NOT_CLOSED'
    when t.box_id is null then 'BLOCK: BOX_TRACKING_NOT_FOUND'
    when coalesce(t.location_state,'') <> 'WAREHOUSE' then 'BLOCK: BOX_NOT_IN_WAREHOUSE'
    when t.active_transfer_id is not null then 'BLOCK: BOX_IN_TRANSIT'
    when h.history_id is null then 'BLOCK: BOX_HISTORY_NOT_FOUND'
    when h.workflow_status <> 'IN_STOCK' then 'BLOCK: BOX_NOT_IN_STOCK'
    else 'READY_FOR_WHOLE_BOX_ISSUE'
  end as issue_gate
from params p
left join public.stock_boxes b on upper(b.box_code)=upper(p.box_code)
left join public.tkn_v5261_box_tracking t on t.box_id=b.id
left join public.branches br on br.id=t.branch_id
left join latest_history h on h.box_id=b.id;

-- ตรวจ Snapshot ปัจจุบันเทียบประวัติตอนรับเข้า
with params as (select 'TKN-B-MIX-A03'::text as box_code),
box as (
  select id,box_code from public.stock_boxes b,params p
  where upper(b.box_code)=upper(p.box_code) limit 1
), hist as (
  select h.id from public.tkn_box_history h join box b on b.id=h.box_id
  order by h.revision desc,h.created_at desc limit 1
), current_items as (
  select i.product_id,upper(btrim(i.sku)) sku,sum(i.quantity)::numeric quantity
  from public.stock_box_items i join box b on b.id=i.box_id
  where i.quantity>0 group by i.product_id,upper(btrim(i.sku))
), history_items as (
  select i.product_id,upper(btrim(i.sku)) sku,sum(i.quantity)::numeric quantity
  from public.tkn_box_history_items i join hist h on h.id=i.history_id
  where i.quantity>0 group by i.product_id,upper(btrim(i.sku))
)
select
  coalesce(c.sku,h.sku) as sku,
  c.quantity as current_quantity,
  h.quantity as snapshot_quantity,
  case when c.product_id is null or h.product_id is null or c.quantity<>h.quantity then 'MISMATCH' else 'MATCH' end as snapshot_check
from current_items c
full join history_items h on h.product_id=c.product_id and h.sku=c.sku
order by sku;

-- ตรวจยอดที่ POS จะเห็นหลังออกจากกล่อง (READ ONLY)
with params as (select 'TKN-B-MIX-A03'::text as box_code),
box as (
  select b.id,b.box_code,t.branch_id
  from public.stock_boxes b
  left join public.tkn_v5261_box_tracking t on t.box_id=b.id
  join params p on upper(b.box_code)=upper(p.box_code)
  limit 1
)
select
  b.box_code,
  i.sku,
  i.quantity as quantity_in_this_box,
  p.stock_remaining,
  p.in_box,
  p.outside_box_available,
  case
    when p.product_id is null then 'BLOCK: NO_BRANCH_INVENTORY_POSITION'
    when coalesce(p.stock_remaining,0) < i.quantity then 'BLOCK: BRANCH_STOCK_TOO_LOW'
    else 'POSITION_OK'
  end as position_check
from box b
join public.stock_box_items i on i.box_id=b.id and i.quantity>0
left join public.tkn_v5261_product_stock_position p
  on p.branch_id=b.branch_id and p.product_id=i.product_id
order by i.sku;

-- Audit ล่าสุดของกล่อง (0 แถว = ยังไม่เคยเบิกสำเร็จ)
select box_code,branch_id,category_text,issued_by,issued_at
from public.tkn_v5315_whole_box_issue_audit
where upper(box_code)=upper('TKN-B-MIX-A03')
order by issued_at desc
limit 10;
