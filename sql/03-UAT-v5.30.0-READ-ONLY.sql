-- TKN v5.30.0 UAT — READ ONLY
select h.box_code,h.workflow_status,h.total_quantity,h.location_text,l.stock_document_no,
       coalesce(p.status,'NO_PUTAWAY_TASK') putaway_status,p.location_code
from public.tkn_box_history h
left join public.tkn_box_stock_intake_ledger l on l.history_id=h.id
left join public.tkn_box_putaway_tasks p on p.history_id=h.id
order by h.created_at desc limit 30;