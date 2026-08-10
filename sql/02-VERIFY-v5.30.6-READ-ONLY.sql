-- TKN v5.30.6 VERIFY — READ ONLY
select 'v5.30.6 recovery rpc' check_name,
case when to_regprocedure('public.tkn_v5306_recover_closed_box_to_waiting(text,text,text,text)') is not null then 'PASS' else 'FAIL' end result;

-- กล่อง CLOSED ที่ยังไม่มี WAITING_STOCK/IN_STOCK history
select b.box_code,b.status,b.closed_at,
       count(i.id) filter(where i.quantity>0) item_rows,
       coalesce(sum(i.quantity) filter(where i.quantity>0),0) total_quantity
from public.stock_boxes b
left join public.stock_box_items i on i.box_id=b.id
where upper(coalesce(b.status,''))='CLOSED'
and not exists(
  select 1 from public.tkn_box_history h
  where h.box_id=b.id and h.workflow_status in('WAITING_STOCK','IN_STOCK')
)
group by b.id,b.box_code,b.status,b.closed_at
order by b.closed_at desc nulls last
limit 100;
