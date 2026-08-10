-- TKN v5.30.9 — SORTING PRODUCT RESOLVE/CREATE + ATOMIC BOX COMMIT
-- Scoped backend functions. Frontend never writes products directly.
-- Does NOT increase branch_inventory. Stock is added only at Stock Intake.
begin;

create or replace function public.tkn_v5309_can_sorting_create_product()
returns boolean
language sql stable security definer set search_path=''
as $f$
  select
    auth.uid() is not null
    and (
      public.tkn_v5261_has_permission('product.manage')
      or public.tkn_v5261_has_permission('inventory.receive')
    );
$f$;

revoke all on function public.tkn_v5309_can_sorting_create_product() from public,anon;
grant execute on function public.tkn_v5309_can_sorting_create_product() to authenticated;


create or replace function public.tkn_v5309_resolve_or_create_sorting_product(
  p_sku text,
  p_name text,
  p_cost_price numeric default 0,
  p_selling_price numeric default 0,
  p_source_barcode text default null,
  p_product_type_th text default null,
  p_model_name text default null,
  p_lot_code text default null,
  p_lot_cost_letter text default null
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $f$
declare
  v_sku text;
  v_barcode text;
  v_name text;
  v_product public.products%rowtype;
  v_markup numeric;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5309_can_sorting_create_product() then
    raise exception 'PERMISSION_DENIED: sorting product create requires product.manage or inventory.receive';
  end if;

  v_sku := upper(btrim(coalesce(p_sku,'')));
  v_barcode := nullif(btrim(coalesce(p_source_barcode,'')),'');
  v_name := nullif(btrim(coalesce(p_name,'')),'');
  if v_sku='' then raise exception 'SKU_REQUIRED'; end if;
  if v_name is null then raise exception 'PRODUCT_NAME_REQUIRED:%',v_sku; end if;

  -- Resolve existing master first; do not create duplicates.
  select * into v_product
  from public.products p
  where upper(coalesce(p.product_code,''))=v_sku
     or upper(coalesce(p.sku_alias,''))=v_sku
     or upper(coalesce(p.base_sku,''))=v_sku
     or (v_barcode is not null and (p.barcode=v_barcode or p.source_barcode=v_barcode))
  order by
    case when upper(coalesce(p.product_code,''))=v_sku then 0
         when upper(coalesce(p.sku_alias,''))=v_sku then 1
         when upper(coalesce(p.base_sku,''))=v_sku then 2
         else 3 end,
    p.created_at
  limit 1;

  if found then
    return jsonb_build_object(
      'id',v_product.id,
      'product_code',v_product.product_code,
      'created',false,
      'resolved_by','EXISTING_MASTER'
    );
  end if;

  v_markup := case
    when coalesce(p_cost_price,0)>0
      then greatest(0,round(((greatest(coalesce(p_selling_price,0),0)-p_cost_price)/p_cost_price)*100,2))
    else 0 end;

  begin
    insert into public.products(
      product_code,barcode,name,cost_price,selling_price,quantity,minimum_stock,
      is_active,created_at,updated_at,vat_rate,sku_alias,allow_negative_stock,
      base_sku,source_barcode,lot_code,lot_cost_letter,product_type_th,model_name,
      label_name,markup_percent,vat_mode,price_rounding
    ) values (
      v_sku,v_barcode,v_name,
      greatest(coalesce(p_cost_price,0),0),
      greatest(coalesce(p_selling_price,0),0),
      0,0,true,now(),now(),7,
      v_sku,false,v_sku,v_barcode,
      nullif(btrim(coalesce(p_lot_code,'')),''),
      nullif(btrim(coalesce(p_lot_cost_letter,'')),''),
      nullif(btrim(coalesce(p_product_type_th,'')),''),
      nullif(btrim(coalesce(p_model_name,'')),''),
      v_name,v_markup,'EXCLUDED','NONE'
    )
    returning * into v_product;
  exception when unique_violation then
    -- Safe race recovery: another session created the same SKU while we were inserting.
    select * into v_product
    from public.products p
    where upper(coalesce(p.product_code,''))=v_sku
       or upper(coalesce(p.sku_alias,''))=v_sku
       or upper(coalesce(p.base_sku,''))=v_sku
       or (v_barcode is not null and (p.barcode=v_barcode or p.source_barcode=v_barcode))
    order by p.created_at
    limit 1;
    if not found then raise; end if;
  end;

  return jsonb_build_object(
    'id',v_product.id,
    'product_code',v_product.product_code,
    'created',true,
    'resolved_by','SORTING_WORKFLOW_CREATE'
  );
end $f$;

revoke all on function public.tkn_v5309_resolve_or_create_sorting_product(text,text,numeric,numeric,text,text,text,text,text) from public,anon;
grant execute on function public.tkn_v5309_resolve_or_create_sorting_product(text,text,numeric,numeric,text,text,text,text,text) to authenticated;


create or replace function public.tkn_v5309_commit_box_to_waiting(
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
  if not public.tkn_v5309_can_sorting_create_product() then
    raise exception 'PERMISSION_DENIED: sorting/receive workflow';
  end if;

  v_code := upper(btrim(coalesce(p_box_code,'')));
  if v_code='' then raise exception 'BOX_CODE_REQUIRED'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'BOX_ITEMS_REQUIRED';
  end if;

  select count(*) into v_count
  from (
    select upper(btrim(x.sku)) sku
    from jsonb_to_recordset(p_items) as x(product_id uuid,sku text,quantity numeric)
    where nullif(btrim(x.sku),'') is not null
    group by upper(btrim(x.sku))
    having count(*)>1
  ) d;
  if v_count>0 then raise exception 'DUPLICATE_SKU_IN_BOX_PAYLOAD'; end if;

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

  select * into v_box
  from public.stock_boxes
  where upper(box_code)=v_code
  limit 1
  for update;

  if found then
    select * into v_history
    from public.tkn_box_history
    where box_id=v_box.id and workflow_status='IN_STOCK'
    order by revision desc limit 1;
    if found then
      return jsonb_build_object('box_id',v_box.id,'box_code',v_box.box_code,'history_id',v_history.id,'workflow_status','IN_STOCK','already_in_stock',true);
    end if;

    select * into v_history
    from public.tkn_box_history
    where box_id=v_box.id and workflow_status='WAITING_STOCK'
    order by revision desc limit 1;
    if found then
      return jsonb_build_object('box_id',v_box.id,'box_code',v_box.box_code,'history_id',v_history.id,'workflow_status','WAITING_STOCK','already_waiting',true);
    end if;

    if exists(select 1 from public.tkn_box_history where box_id=v_box.id) then
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
    values(v_code,'CLOSED',nullif(btrim(p_location_text),''),now())
    returning * into v_box;
  end if;

  delete from public.stock_box_items where box_id=v_box.id;

  insert into public.stock_box_items(box_id,product_id,sku,quantity)
  select v_box.id,x.product_id,upper(btrim(x.sku)),x.quantity
  from jsonb_to_recordset(p_items) as x(product_id uuid,sku text,quantity numeric)
  where x.quantity>0;

  if not exists(select 1 from public.stock_box_items where box_id=v_box.id and quantity>0) then
    raise exception 'BOX_ITEMS_NOT_PERSISTED';
  end if;

  v_result := public.tkn_v5283_close_box_to_waiting(
    v_box.box_code,v_branch,
    nullif(btrim(p_category_text),''),
    nullif(btrim(p_zone_code),''),
    nullif(btrim(p_location_text),'')
  );

  if coalesce(v_result->>'workflow_status','')<>'WAITING_STOCK'
     or nullif(v_result->>'history_id','') is null then
    raise exception 'WAITING_STOCK_NOT_CONFIRMED';
  end if;

  return v_result || jsonb_build_object(
    'box_id',v_box.id,'box_code',v_box.box_code,
    'warehouse_branch_id',v_branch,'atomic_commit',true
  );
end $f$;

revoke all on function public.tkn_v5309_commit_box_to_waiting(text,jsonb,text,text,text) from public,anon;
grant execute on function public.tkn_v5309_commit_box_to_waiting(text,jsonb,text,text,text) to authenticated;

commit;
