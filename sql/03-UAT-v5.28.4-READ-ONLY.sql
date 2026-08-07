-- TKN v5.28.4 UAT — READ ONLY
-- หลังปิดกล่องใหม่ 1 กล่อง ให้เห็น WAITING_STOCK + event
select h.box_code,h.workflow_status,h.sku_count,h.total_quantity,h.closed_at,
       (select count(*) from public.tkn_box_lifecycle_events e where e.history_id=h.id) event_count,
       (select count(*) from public.tkn_box_qr_print_history p where p.history_id=h.id) print_count
from public.tkn_box_history h
order by h.closed_at desc
limit 20;

-- Timeline ล่าสุด
select e.box_code,e.event_type,e.status_from,e.status_to,e.note,e.event_at
from public.tkn_box_lifecycle_events e
order by e.event_at desc
limit 100;
