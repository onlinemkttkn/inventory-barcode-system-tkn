-- ============================================================
-- TKN v5.30.0 — WAREHOUSE ONE-FLOW + PUTAWAY
-- ADDITIVE / DB-SAFE
-- CLOSE -> WAITING_STOCK -> IN_STOCK/WAITING_PUTAWAY -> PUTAWAY
-- ============================================================
begin;

create table if not exists public.tkn_box_putaway_tasks(
  id uuid primary key default gen_random_uuid(),
  history_id uuid not null unique references public.tkn_box_history(id) on delete restrict,
  box_id uuid not null references public.stock_boxes(id) on delete restrict,
  box_code text not null,
  branch_id uuid not null references public.branches(id) on delete restrict,
  stock_document_id uuid,
  stock_document_no text,
  status text not null default 'WAITING_PUTAWAY' check(status in('WAITING_PUTAWAY','PUTAWAY','CANCELLED')),
  location_code text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  putaway_at timestamptz,
  putaway_by uuid,
  updated_at timestamptz not null default now()
);
create index if not exists idx_tkn_putaway_status on public.tkn_box_putaway_tasks(status,created_at);
create index if not exists idx_tkn_putaway_box on public.tkn_box_putaway_tasks(box_code,created_at desc);
alter table public.tkn_box_putaway_tasks enable row level security;
revoke all on public.tkn_box_putaway_tasks from public,anon,authenticated;
grant select on public.tkn_box_putaway_tasks to authenticated;
drop policy if exists tkn_v5300_putaway_read on public.tkn_box_putaway_tasks;
create policy tkn_v5300_putaway_read on public.tkn_box_putaway_tasks for select to authenticated
using(public.tkn_v5261_has_permission('inventory.view') or public.tkn_v5261_has_permission('inventory.receive') or public.tkn_v5261_has_permission('inventory.count'));

create or replace function public.tkn_v5300_warehouse_branch_id()
returns uuid language plpgsql stable security definer set search_path=''
as $f$
declare v_id uuid;
begin
  select b.id into v_id from public.branches b
  where b.is_active=true and (
    lower(regexp_replace(coalesce(b.name,''),'[\\s_-]+','','g')) like '%โกดังเก็บสินค้า%'
    or lower(regexp_replace(coalesce(b.name,''),'[\\s_-]+','','g')) like '%โกดัง%'
    or upper(coalesce(b.code,'')) in ('WAREHOUSE','WH','WH-MAIN','WAREHOUSE-MAIN')
  )
  order by case
    when lower(regexp_replace(coalesce(b.name,''),'[\\s_-]+','','g'))='โกดังเก็บสินค้า' then 1
    when lower(regexp_replace(coalesce(b.name,''),'[\\s_-]+','','g')) like '%โกดังเก็บสินค้า%' then 2
    when lower(regexp_replace(coalesce(b.name,''),'[\\s_-]+','','g')) like '%โกดัง%' then 3
    when upper(coalesce(b.code,''))='WAREHOUSE' then 4 else 5 end,
    coalesce(b.sort_order,999999),b.code
  limit 1;
  if v_id is null then raise exception 'WAREHOUSE_BRANCH_NOT_FOUND: กรุณาสร้าง/เปิดสาขา โกดังเก็บสินค้า'; end if;
  return v_id;
end $f$;

create or replace function public.tkn_v5300_warehouse_branch()
returns jsonb language plpgsql stable security definer set search_path=''
as $f$
declare v_id uuid; r jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  v_id:=public.tkn_v5300_warehouse_branch_id();
  select to_jsonb(x) into r from (select id,code,name,is_active from public.branches where id=v_id) x;
  return r;
end $f$;

create or replace function public.tkn_v5300_close_box_to_stock_intake(
  p_box_code text,p_category_text text default null,p_zone_code text default null,p_location_text text default null
) returns jsonb language plpgsql volatile security definer set search_path=''
as $f$
declare v_branch uuid; r jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then raise exception 'PERMISSION_DENIED: product.manage'; end if;
  v_branch:=public.tkn_v5300_warehouse_branch_id();
  r:=public.tkn_v5283_close_box_to_waiting(p_box_code,v_branch,p_category_text,p_zone_code,p_location_text);
  return r||jsonb_build_object('warehouse_branch_id',v_branch,'next_step','STOCK_INTAKE');
end $f$;

create or replace function public.tkn_v5300_receive_stock_intake(p_history_id uuid,p_scan_code text,p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path=''
as $f$
declare v_branch uuid; r jsonb; h public.tkn_box_history%rowtype; l public.tkn_box_stock_intake_ledger%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('inventory.receive') then raise exception 'PERMISSION_DENIED: inventory.receive'; end if;
  v_branch:=public.tkn_v5300_warehouse_branch_id();
  r:=public.tkn_v5285_receive_stock_intake(p_history_id,v_branch,p_scan_code,p_note);
  select * into h from public.tkn_box_history where id=p_history_id;
  select * into l from public.tkn_box_stock_intake_ledger where history_id=p_history_id;
  if h.id is null or l.history_id is null then raise exception 'STOCK_INTAKE_LEDGER_NOT_FOUND'; end if;
  perform public.tkn_v5261_register_box_location(h.box_code,v_branch,'WAREHOUSE');
  insert into public.tkn_box_putaway_tasks(history_id,box_id,box_code,branch_id,stock_document_id,stock_document_no,status,created_by)
  values(h.id,h.box_id,h.box_code,v_branch,l.stock_document_id,l.stock_document_no,'WAITING_PUTAWAY',auth.uid())
  on conflict(history_id) do update set stock_document_id=excluded.stock_document_id,stock_document_no=excluded.stock_document_no,updated_at=now();
  return r||jsonb_build_object('warehouse_branch_id',v_branch,'putaway_status','WAITING_PUTAWAY','next_step','PUTAWAY');
end $f$;

create or replace function public.tkn_v5300_list_putaway_queue(p_search text default null,p_limit integer default 250)
returns jsonb language plpgsql stable security definer set search_path=''
as $f$
declare r jsonb; v_branch uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (public.tkn_v5261_has_permission('inventory.receive') or public.tkn_v5261_has_permission('inventory.view') or public.tkn_v5261_has_permission('inventory.count')) then raise exception 'PERMISSION_DENIED: inventory.view'; end if;
  v_branch:=public.tkn_v5300_warehouse_branch_id();
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at asc),'[]'::jsonb) into r from (
    select t.id task_id,t.history_id,t.box_code,t.branch_id,t.stock_document_no,t.status,t.location_code,t.created_at,h.sku_count,h.total_quantity,h.category_text,h.zone_code,h.closed_at
    from public.tkn_box_putaway_tasks t join public.tkn_box_history h on h.id=t.history_id
    where t.status='WAITING_PUTAWAY' and t.branch_id=v_branch
      and (nullif(btrim(coalesce(p_search,'')),'') is null or t.box_code ilike '%'||btrim(p_search)||'%' or coalesce(h.category_text,'') ilike '%'||btrim(p_search)||'%')
    order by t.created_at asc limit greatest(1,least(coalesce(p_limit,250),500))
  ) x;
  return r;
end $f$;

create or replace function public.tkn_v5300_putaway_lookup(p_box_code text)
returns jsonb language plpgsql stable security definer set search_path=''
as $f$
declare t public.tkn_box_putaway_tasks%rowtype; h public.tkn_box_history%rowtype; items jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (public.tkn_v5261_has_permission('inventory.receive') or public.tkn_v5261_has_permission('inventory.count')) then raise exception 'PERMISSION_DENIED: inventory.receive'; end if;
  select * into t from public.tkn_box_putaway_tasks where box_code=btrim(coalesce(p_box_code,'')) order by created_at desc limit 1;
  if not found then raise exception 'PUTAWAY_BOX_NOT_FOUND'; end if;
  select * into h from public.tkn_box_history where id=t.history_id;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sku),'[]'::jsonb) into items from (
    select sku,barcode,product_name,quantity from public.tkn_box_history_items where history_id=t.history_id
  ) x;
  return jsonb_build_object('task',to_jsonb(t),'history',to_jsonb(h),'items',items,'already_putaway',(t.status='PUTAWAY'));
end $f$;

create or replace function public.tkn_v5300_putaway_box(p_history_id uuid,p_scan_code text,p_location_code text)
returns jsonb language plpgsql volatile security definer set search_path=''
as $f$
declare t public.tkn_box_putaway_tasks%rowtype; h public.tkn_box_history%rowtype; loc text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (public.tkn_v5261_has_permission('inventory.receive') or public.tkn_v5261_has_permission('inventory.count')) then raise exception 'PERMISSION_DENIED: inventory.receive'; end if;
  loc:=upper(btrim(coalesce(p_location_code,'')));
  if loc='' then raise exception 'LOCATION_REQUIRED'; end if;
  if length(loc)>80 then raise exception 'LOCATION_TOO_LONG'; end if;
  select * into t from public.tkn_box_putaway_tasks where history_id=p_history_id for update;
  if not found then raise exception 'PUTAWAY_TASK_NOT_FOUND'; end if;
  select * into h from public.tkn_box_history where id=t.history_id for update;
  if btrim(coalesce(p_scan_code,''))<>h.box_code and btrim(coalesce(p_scan_code,''))<>h.qr_payload then raise exception 'QR_BOX_MISMATCH'; end if;
  if h.workflow_status<>'IN_STOCK' then raise exception 'BOX_NOT_IN_STOCK'; end if;
  if t.status='PUTAWAY' then return jsonb_build_object('already_putaway',true,'box_code',t.box_code,'location_code',t.location_code,'putaway_at',t.putaway_at); end if;
  if t.status<>'WAITING_PUTAWAY' then raise exception 'PUTAWAY_TASK_NOT_WAITING'; end if;
  update public.tkn_box_putaway_tasks set status='PUTAWAY',location_code=loc,putaway_at=now(),putaway_by=auth.uid(),updated_at=now() where id=t.id returning * into t;
  update public.tkn_box_history set location_text=loc,updated_at=now() where id=h.id;
  update public.stock_boxes set location=loc,location_text=loc where id=h.box_id;
  return jsonb_build_object('already_putaway',false,'history_id',h.id,'box_code',h.box_code,'location_code',loc,'putaway_at',t.putaway_at,'workflow_status','IN_STOCK');
end $f$;

revoke all on function public.tkn_v5300_warehouse_branch_id() from public,anon;
revoke all on function public.tkn_v5300_warehouse_branch() from public,anon;
revoke all on function public.tkn_v5300_close_box_to_stock_intake(text,text,text,text) from public,anon;
revoke all on function public.tkn_v5300_receive_stock_intake(uuid,text,text) from public,anon;
revoke all on function public.tkn_v5300_list_putaway_queue(text,integer) from public,anon;
revoke all on function public.tkn_v5300_putaway_lookup(text) from public,anon;
revoke all on function public.tkn_v5300_putaway_box(uuid,text,text) from public,anon;
grant execute on function public.tkn_v5300_warehouse_branch() to authenticated;
grant execute on function public.tkn_v5300_close_box_to_stock_intake(text,text,text,text) to authenticated;
grant execute on function public.tkn_v5300_receive_stock_intake(uuid,text,text) to authenticated;
grant execute on function public.tkn_v5300_list_putaway_queue(text,integer) to authenticated;
grant execute on function public.tkn_v5300_putaway_lookup(text) to authenticated;
grant execute on function public.tkn_v5300_putaway_box(uuid,text,text) to authenticated;

commit;