-- TKN v5.31.5 — UAT READ ONLY หลังทดสอบ Browser

-- 1) หลังเบิกทั้งกล่อง history รอบนั้นควรเป็น REOPENED
select h.box_code,h.revision,h.workflow_status,h.category_text,h.zone_code,h.total_quantity,h.updated_at
from public.tkn_box_history h
order by h.updated_at desc
limit 30;

-- 2) Audit การเบิกทั้งกล่องล่าสุด
select a.box_code,b.code branch_code,b.name branch_name,a.category_text,
       a.box_items_snapshot,a.issue_result,a.issued_by,a.issued_at
from public.tkn_v5315_whole_box_issue_audit a
join public.branches b on b.id=a.branch_id
order by a.issued_at desc
limit 20;

-- 3) หลังเบิก กล่องต้องไม่มี stock_box_items จนกว่าจะนำกล่องไปจัดรอบใหม่
select b.box_code,count(i.id) item_rows,coalesce(sum(i.quantity),0) quantity
from public.stock_boxes b
left join public.stock_box_items i on i.box_id=b.id and i.quantity>0
where b.box_code in(
  select box_code from public.tkn_v5315_whole_box_issue_audit order by issued_at desc limit 10
)
group by b.id,b.box_code
order by b.box_code;

-- 4) สินค้าที่เพิ่งเบิกต้องมี outside_box_available ตาม Snapshot ของกล่องที่เบิก
select p.branch_code,p.product_code,p.product_name,p.stock_remaining,p.in_box,p.outside_box_available
from public.tkn_v5261_product_stock_position p
where exists(
  select 1
  from public.tkn_v5315_whole_box_issue_audit a,
       jsonb_to_recordset(a.box_items_snapshot) as s(product_id uuid,sku text,quantity numeric)
  where a.branch_id=p.branch_id
    and s.product_id=p.product_id
    and a.issued_at > now()-interval '1 day'
)
order by p.branch_code,p.product_code;
