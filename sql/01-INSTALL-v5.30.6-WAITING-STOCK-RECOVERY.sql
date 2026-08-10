-- TKN v5.30.6 — WAITING_STOCK Recovery
-- ADDITIVE / IDEMPOTENT / DOES NOT CHANGE INVENTORY QUANTITY
begin;

create or replace function public.tkn_v5306_recover_closed_box_to_waiting(
  p_box_code text,
  p_category_text text default null,
  p_zone_code text default null,
  p_location_text text default null
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $f$
declare
  v_input text;
  v_code text;
  v_box public.stock_boxes%rowtype;
  v_history public.tkn_box_history%rowtype;
  v_branch uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then
    raise exception 'PERMISSION_DENIED: product.manage';
  end if;

  v_input := upper(btrim(coalesce(p_box_code,'')));
  if v_input='' then raise exception 'BOX_CODE_REQUIRED'; end if;

  -- Accept both canonical TKN-B-XXX and short XXX codes.
  select * into v_box
  from public.stock_boxes
  where upper(box_code)=v_input
     or upper(box_code)=case when v_input like 'TKN-B-%' then v_input else 'TKN-B-'||v_input end
  order by case when upper(box_code)=v_input then 0 else 1 end
  limit 1
  for update;

  if not found then raise exception 'BOX_NOT_FOUND_IN_STOCK_BOXES:%',v_input; end if;
  v_code := v_box.box_code;

  -- If already received, never recreate WAITING_STOCK.
  select * into v_history
  from public.tkn_box_history
  where box_id=v_box.id and workflow_status='IN_STOCK'
  order by revision desc limit 1;
  if found then
    return jsonb_build_object(
      'box_code',v_code,'history_id',v_history.id,
      'workflow_status','IN_STOCK','already_in_stock',true,'recovered',false
    );
  end if;

  -- If already waiting, return it without duplicate history.
  select * into v_history
  from public.tkn_box_history
  where box_id=v_box.id and workflow_status='WAITING_STOCK'
  order by revision desc limit 1;
  if found then
    return jsonb_build_object(
      'box_code',v_code,'history_id',v_history.id,
      'workflow_status','WAITING_STOCK','already_waiting',true,'recovered',false
    );
  end if;

  if not exists(
    select 1 from public.stock_box_items
    where box_id=v_box.id and quantity>0
  ) then raise exception 'BOX_EMPTY_OR_ITEMS_NOT_SAVED:%',v_code; end if;

  if exists(
    select 1 from public.stock_box_items
    where box_id=v_box.id and quantity>0 and product_id is null
  ) then raise exception 'BOX_HAS_UNRESOLVED_PRODUCT:%',v_code; end if;

  v_branch := public.tkn_v5300_warehouse_branch_id();
  if v_branch is null then raise exception 'WAREHOUSE_BRANCH_NOT_CONFIGURED'; end if;

  -- Reuse the proven idempotent snapshot function.
  v_result := public.tkn_v5283_close_box_to_waiting(
    v_code,
    v_branch,
    p_category_text,
    p_zone_code,
    p_location_text
  );

  if coalesce(v_result->>'workflow_status','') <> 'WAITING_STOCK'
     or nullif(v_result->>'history_id','') is null then
    raise exception 'WAITING_STOCK_RECOVERY_NOT_CONFIRMED';
  end if;

  return v_result || jsonb_build_object(
    'warehouse_branch_id',v_branch,
    'recovered',true,
    'next_step','STOCK_INTAKE'
  );
end $f$;

revoke all on function public.tkn_v5306_recover_closed_box_to_waiting(text,text,text,text) from public,anon;
grant execute on function public.tkn_v5306_recover_closed_box_to_waiting(text,text,text,text) to authenticated;

commit;
