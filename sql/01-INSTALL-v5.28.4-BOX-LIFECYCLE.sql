-- ============================================================
-- TKN v5.28.4 — BOX LIFECYCLE EVENTS + WAITING STOCK QUEUE
-- ADDITIVE / DB-SAFE
-- ============================================================
begin;

create table if not exists public.tkn_box_lifecycle_events(
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  history_id uuid not null references public.tkn_box_history(id) on delete cascade,
  box_id uuid not null references public.stock_boxes(id) on delete restrict,
  box_code text not null,
  event_type text not null,
  status_from text,
  status_to text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid,
  event_at timestamptz not null default now()
);
create index if not exists idx_tkn_box_lifecycle_history on public.tkn_box_lifecycle_events(history_id,event_at desc);
create index if not exists idx_tkn_box_lifecycle_box on public.tkn_box_lifecycle_events(box_code,event_at desc);
create index if not exists idx_tkn_box_lifecycle_type on public.tkn_box_lifecycle_events(event_type,event_at desc);

alter table public.tkn_box_lifecycle_events enable row level security;
revoke all on public.tkn_box_lifecycle_events from public,anon,authenticated;
grant select on public.tkn_box_lifecycle_events to authenticated;
drop policy if exists tkn_v5284_box_lifecycle_read on public.tkn_box_lifecycle_events;
create policy tkn_v5284_box_lifecycle_read on public.tkn_box_lifecycle_events for select to authenticated
using(public.tkn_v5261_has_permission('product.manage'));

create or replace function public.tkn_v5284_history_event_trigger()
returns trigger language plpgsql security definer set search_path=''
as $f$
declare k text;t text;
begin
  if tg_op='INSERT' then
    t:=case new.workflow_status when 'WAITING_STOCK' then 'BOX_CLOSED_WAITING_STOCK' when 'IN_STOCK' then 'BOX_IN_STOCK' else 'BOX_HISTORY_CREATED' end;
    k:='history:'||new.id::text||':insert:'||new.workflow_status;
    insert into public.tkn_box_lifecycle_events(event_key,history_id,box_id,box_code,event_type,status_to,note,actor_id,event_at)
    values(k,new.id,new.box_id,new.box_code,t,new.workflow_status,'สร้าง Snapshot กล่อง',new.closed_by,new.closed_at)
    on conflict(event_key) do nothing;
  elsif new.workflow_status is distinct from old.workflow_status then
    t:=case new.workflow_status when 'WAITING_STOCK' then 'MOVED_TO_WAITING_STOCK' when 'IN_STOCK' then 'STOCK_RECEIVED' when 'REOPENED' then 'BOX_REOPENED' when 'CANCELLED' then 'BOX_CANCELLED' else 'STATUS_CHANGED' end;
    k:='history:'||new.id::text||':status:'||old.workflow_status||'>'||new.workflow_status;
    insert into public.tkn_box_lifecycle_events(event_key,history_id,box_id,box_code,event_type,status_from,status_to,note,actor_id,event_at)
    values(k,new.id,new.box_id,new.box_code,t,old.workflow_status,new.workflow_status,'เปลี่ยนสถานะกล่อง',coalesce(new.stock_received_by,new.closed_by),now())
    on conflict(event_key) do nothing;
  end if;
  return new;
end $f$;

drop trigger if exists trg_tkn_v5284_box_history_event on public.tkn_box_history;
create trigger trg_tkn_v5284_box_history_event after insert or update of workflow_status on public.tkn_box_history
for each row execute function public.tkn_v5284_history_event_trigger();

create or replace function public.tkn_v5284_print_event_trigger()
returns trigger language plpgsql security definer set search_path=''
as $f$
begin
  insert into public.tkn_box_lifecycle_events(event_key,history_id,box_id,box_code,event_type,status_to,note,metadata,actor_id,event_at)
  select 'print:'||new.id::text,new.history_id,h.box_id,new.box_code,
         case new.print_type when 'REPRINT' then 'QR_REPRINT' else 'QR_FIRST_PRINT' end,
         h.workflow_status,'พิมพ์ QR กล่อง '||new.copies||' สำเนา',
         jsonb_build_object('copies',new.copies,'print_type',new.print_type,'settings',new.print_settings),new.printed_by,new.printed_at
  from public.tkn_box_history h where h.id=new.history_id
  on conflict(event_key) do nothing;
  return new;
end $f$;
drop trigger if exists trg_tkn_v5284_box_print_event on public.tkn_box_qr_print_history;
create trigger trg_tkn_v5284_box_print_event after insert on public.tkn_box_qr_print_history
for each row execute function public.tkn_v5284_print_event_trigger();

create or replace function public.tkn_v5284_intake_event_trigger()
returns trigger language plpgsql security definer set search_path=''
as $f$
begin
  insert into public.tkn_box_lifecycle_events(event_key,history_id,box_id,box_code,event_type,status_from,status_to,note,metadata,actor_id,event_at)
  values('intake:'||new.id::text,new.history_id,new.box_id,new.box_code,'STOCK_INTAKE_COMMITTED','WAITING_STOCK','IN_STOCK',
         'รับเข้าสต็อกทั้งกล่อง · เอกสาร '||coalesce(new.stock_document_no,'-'),
         jsonb_build_object('stock_document_id',new.stock_document_id,'stock_document_no',new.stock_document_no,'total_quantity',new.total_quantity),new.received_by,new.received_at)
  on conflict(event_key) do nothing;
  return new;
end $f$;
drop trigger if exists trg_tkn_v5284_box_intake_event on public.tkn_box_stock_intake_ledger;
create trigger trg_tkn_v5284_box_intake_event after insert on public.tkn_box_stock_intake_ledger
for each row execute function public.tkn_v5284_intake_event_trigger();

-- Backfill ประวัติเดิมอย่างปลอดภัย
insert into public.tkn_box_lifecycle_events(event_key,history_id,box_id,box_code,event_type,status_to,note,actor_id,event_at)
select 'history:'||h.id::text||':insert:'||h.workflow_status,h.id,h.box_id,h.box_code,
       case h.workflow_status when 'WAITING_STOCK' then 'BOX_CLOSED_WAITING_STOCK' when 'IN_STOCK' then 'BOX_IN_STOCK' when 'REOPENED' then 'BOX_REOPENED' else 'BOX_HISTORY_CREATED' end,
       h.workflow_status,'Backfill Snapshot กล่อง',h.closed_by,h.closed_at
from public.tkn_box_history h
on conflict(event_key) do nothing;

insert into public.tkn_box_lifecycle_events(event_key,history_id,box_id,box_code,event_type,status_to,note,metadata,actor_id,event_at)
select 'print:'||p.id::text,p.history_id,h.box_id,p.box_code,case p.print_type when 'REPRINT' then 'QR_REPRINT' else 'QR_FIRST_PRINT' end,h.workflow_status,
       'Backfill ประวัติพิมพ์ QR',jsonb_build_object('copies',p.copies,'print_type',p.print_type,'settings',p.print_settings),p.printed_by,p.printed_at
from public.tkn_box_qr_print_history p join public.tkn_box_history h on h.id=p.history_id
on conflict(event_key) do nothing;

insert into public.tkn_box_lifecycle_events(event_key,history_id,box_id,box_code,event_type,status_from,status_to,note,metadata,actor_id,event_at)
select 'intake:'||l.id::text,l.history_id,l.box_id,l.box_code,'STOCK_INTAKE_COMMITTED','WAITING_STOCK','IN_STOCK',
       'Backfill รับเข้าสต็อก · เอกสาร '||coalesce(l.stock_document_no,'-'),jsonb_build_object('stock_document_id',l.stock_document_id,'stock_document_no',l.stock_document_no,'total_quantity',l.total_quantity),l.received_by,l.received_at
from public.tkn_box_stock_intake_ledger l
on conflict(event_key) do nothing;

create or replace function public.tkn_v5284_list_waiting_box_queue(p_search text default null,p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path=''
as $f$
declare r jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then raise exception 'PERMISSION_DENIED: product.manage'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.closed_at asc),'[]'::jsonb) into r
  from (
    select h.id history_id,h.box_id,h.box_code,h.revision,h.workflow_status,h.category_text,h.zone_code,h.location_text,h.sku_count,h.total_quantity,h.closed_at,h.branch_id,b.name branch_name,
           (select count(*) from public.tkn_box_qr_print_history p where p.history_id=h.id) print_count
    from public.tkn_box_history h left join public.branches b on b.id=h.branch_id
    where h.workflow_status='WAITING_STOCK'
      and (nullif(btrim(coalesce(p_search,'')),'') is null or h.box_code ilike '%'||btrim(p_search)||'%' or coalesce(h.category_text,'') ilike '%'||btrim(p_search)||'%' or coalesce(h.location_text,'') ilike '%'||btrim(p_search)||'%')
    order by h.closed_at asc
    limit greatest(1,least(coalesce(p_limit,200),500))
  ) x;
  return r;
end $f$;

create or replace function public.tkn_v5284_box_lifecycle_detail(p_history_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $f$
declare h jsonb;e jsonb;i jsonb;p jsonb;l jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then raise exception 'PERMISSION_DENIED: product.manage'; end if;
  select jsonb_build_object('id',x.id,'box_id',x.box_id,'box_code',x.box_code,'revision',x.revision,'workflow_status',x.workflow_status,'category_text',x.category_text,'zone_code',x.zone_code,'location_text',x.location_text,'sku_count',x.sku_count,'total_quantity',x.total_quantity,'closed_at',x.closed_at,'stock_received_at',x.stock_received_at,'stock_document_no',(select y.stock_document_no from public.tkn_box_stock_intake_ledger y where y.history_id=x.id)) into h from public.tkn_box_history x where x.id=p_history_id;
  if h is null then raise exception 'HISTORY_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.event_at asc),'[]'::jsonb) into e from (select event_type,status_from,status_to,note,metadata,actor_id,event_at from public.tkn_box_lifecycle_events where history_id=p_history_id) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sku),'[]'::jsonb) into i from (select sku,barcode,product_name,quantity,cost_price,selling_price from public.tkn_box_history_items where history_id=p_history_id) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.printed_at desc),'[]'::jsonb) into p from (select print_type,copies,print_settings,printed_at,printed_by from public.tkn_box_qr_print_history where history_id=p_history_id) x;
  select to_jsonb(x) into l from (select stock_document_id,stock_document_no,total_quantity,received_at,received_by from public.tkn_box_stock_intake_ledger where history_id=p_history_id) x;
  return jsonb_build_object('history',h,'events',e,'items',i,'prints',p,'intake',l);
end $f$;

revoke all on function public.tkn_v5284_list_waiting_box_queue(text,integer) from public,anon;
revoke all on function public.tkn_v5284_box_lifecycle_detail(uuid) from public,anon;
grant execute on function public.tkn_v5284_list_waiting_box_queue(text,integer) to authenticated;
grant execute on function public.tkn_v5284_box_lifecycle_detail(uuid) to authenticated;

commit;
