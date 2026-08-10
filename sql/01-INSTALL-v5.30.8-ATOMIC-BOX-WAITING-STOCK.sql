-- TKN v5.30.8 — ATOMIC BOX COMMIT -> WAITING_STOCK
-- One transaction: stock_boxes + stock_box_items + box history snapshot.
-- Does NOT change branch_inventory / stock quantity.
begin;

create or replace function public.tkn_v5308_commit_box_to_waiting(
  p_box_code text,
  p_items jsonb,
  p_category_text text default null,
  p_zone_code text default null,
  p_location_text text default null
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $f$
declare
  v_code text;
  v_box public.stock_boxes%rowtype;
  v_history public.tkn_box_history%rowtype;
  v_branch uuid;
  v_result jsonb;
  v_item record;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('product.manage') then
    raise exception 'PERMISSION_DENIED: product.manage';
  end if;

  v_code := upper(btrim(coalesce(p_box_code,'')));
  if v_code='' then raise exception 'BOX_CODE_REQUIRED'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'BOX_ITEMS_REQUIRED';
  end if;

  -- Reject duplicate SKU in payload before touching the box.
  select count(*) into v_count
  from (
    select upper(btrim(x.sku)) sku
    from jsonb_to_recordset(p_items) as x(product_id uuid,sku text,quantity numeric)
    where nullif(btrim(x.sku),'') is not null
    group by upper(btrim(x.sku))
    having count(*)>1
  ) d;
  if v_count>0 then raise exception 'DUPLICATE_SKU_IN_BOX_PAYLOAD'; end if;

  -- Validate every item and every product first.
  for v_item in
    select x.product_id,upper(btrim(x.sku)) sku,x.quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid,sku text,quantity numeric)
  loop
    if v_item.product_id is null then raise exception 'BOX_ITEM_PRODUCT_REQUIRED:%',coalesce(v_item.sku,'?'); end if;
    if nullif(v_item.sku,'') is null then raise exception 'BOX_ITEM_SKU_REQUIRED'; end if;
    if coalesce(v_item.quantity,0)<=0 then raise exception 'BOX_ITEM_QUANTITY_INVALID:%',v_item.sku; end if;
    if not exists(select 1 from public.products p where p.id=v_item.product_id) then
      raise exception 'PRODUCT_NOT_FOUND:%',v_item.product_id;
    end if;
  end loop;

  v_branch := public.tkn_v5300_warehouse_branch_id();
  if v_branch is null then raise exception 'WAREHOUSE_BRANCH_NOT_CONFIGURED'; end if;

  -- Lock existing box if present.
  select * into v_box
  from public.stock_boxes
  where upper(box_code)=v_code
  limit 1
  for update;

  if found then
    -- Never alter a box already received.
    select * into v_history
    from public.tkn_box_history
    where box_id=v_box.id and workflow_status='IN_STOCK'
    order by revision desc limit 1;
    if found then
      return jsonb_build_object(
        'box_id',v_box.id,'box_code',v_box.box_code,'history_id',v_history.id,
        'workflow_status','IN_STOCK','already_in_stock',true
      );
    end if;

    -- Already queued: idempotent return, do not rewrite contents.
    select * into v_history
    from public.tkn_box_history
    where box_id=v_box.id and workflow_status='WAITING_STOCK'
    order by revision desc limit 1;
    if found then
      return jsonb_build_object(
        'box_id',v_box.id,'box_code',v_box.box_code,'history_id',v_history.id,
        'workflow_status','WAITING_STOCK','already_waiting',true
      );
    end if;

    -- Unknown prior history must never have its contents silently rewritten.
    if exists(
      select 1 from public.tkn_box_history
      where box_id=v_box.id
    ) then
      raise exception 'BOX_HAS_PRIOR_HISTORY:%',v_code;
    end if;

    update public.stock_boxes
       set status='CLOSED',
           location_text=coalesce(nullif(btrim(p_location_text),''),location_text),
           closed_at=coalesce(closed_at,now())
     where id=v_box.id
     returning * into v_box;
  else
    insert into public.stock_boxes(box_code,status,location_text,closed_at)
    values(
      v_code,
      'CLOSED',
      nullif(btrim(p_location_text),''),
      now()
    )
    returning * into v_box;
  end if;

  -- No history exists yet, so box contents may safely be made identical to current packing state.
  delete from public.stock_box_items where box_id=v_box.id;

  insert into public.stock_box_items(box_id,product_id,sku,quantity)
  select v_box.id,x.product_id,upper(btrim(x.sku)),x.quantity
  from jsonb_to_recordset(p_items) as x(product_id uuid,sku text,quantity numeric)
  where x.quantity>0;

  if not exists(select 1 from public.stock_box_items where box_id=v_box.id and quantity>0) then
    raise exception 'BOX_ITEMS_NOT_PERSISTED';
  end if;

  v_result := public.tkn_v5283_close_box_to_waiting(
    v_box.box_code,
    v_branch,
    nullif(btrim(p_category_text),''),
    nullif(btrim(p_zone_code),''),
    nullif(btrim(p_location_text),'')
  );

  if coalesce(v_result->>'workflow_status','')<>'WAITING_STOCK'
     or nullif(v_result->>'history_id','') is null then
    raise exception 'WAITING_STOCK_NOT_CONFIRMED';
  end if;

  return v_result || jsonb_build_object(
    'box_id',v_box.id,
    'box_code',v_box.box_code,
    'warehouse_branch_id',v_branch,
    'atomic_commit',true
  );
end $f$;

revoke all on function public.tkn_v5308_commit_box_to_waiting(text,jsonb,text,text,text) from public,anon;
grant execute on function public.tkn_v5308_commit_box_to_waiting(text,jsonb,text,text,text) to authenticated;

commit;
