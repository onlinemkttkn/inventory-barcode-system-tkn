-- TKN POS / ERP MASTER 3.0 LTS
-- Run once after uploading the production package.
begin;

-- Stable action log used by Master 3.0.
create table if not exists public.app_action_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id text,
  branch_id uuid references public.branches(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.app_action_logs enable row level security;

drop policy if exists app_action_logs_read on public.app_action_logs;
create policy app_action_logs_read
on public.app_action_logs
for select to authenticated
using (
  lower(coalesce(
    (select role::text from public.profiles where id=auth.uid()),
    'staff'
  )) in ('owner','admin','secretary')
);

grant select on public.app_action_logs to authenticated;
revoke insert,update,delete on public.app_action_logs from authenticated,anon;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path=public
as $$
  select lower(coalesce(
    (select role::text from public.profiles
     where id=auth.uid() and is_active=true),
    'staff'
  ));
$$;

grant execute on function public.current_app_role() to authenticated;

create or replace function public.set_branch_product_stock(
  p_branch_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_minimum_stock numeric default 0,
  p_reason text default null
)
returns public.branch_inventory
language plpgsql
volatile
security definer
set search_path=public
as $$
declare
  v_inventory public.branch_inventory;
  v_before numeric(14,3);
  v_role text := public.current_app_role();
  v_reason text := btrim(coalesce(p_reason,''));
begin
  if v_role not in ('owner','admin','warehouse') then
    raise exception 'ไม่มีสิทธิ์ปรับสต็อก';
  end if;

  if length(v_reason)<5 then
    raise exception 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร';
  end if;

  if p_quantity<0 then
    raise exception 'จำนวนสต็อกต้องไม่น้อยกว่า 0';
  end if;

  select quantity into v_before
  from public.branch_inventory
  where branch_id=p_branch_id and product_id=p_product_id
  for update;

  insert into public.branch_inventory(
    branch_id,product_id,quantity,minimum_stock
  )
  values(
    p_branch_id,p_product_id,p_quantity,
    greatest(coalesce(p_minimum_stock,0),0)
  )
  on conflict(branch_id,product_id) do update
  set quantity=excluded.quantity,
      minimum_stock=excluded.minimum_stock,
      updated_at=now()
  returning * into v_inventory;

  insert into public.app_action_logs(
    action,entity_type,entity_id,branch_id,details,created_by
  )
  values(
    'STOCK_ADJUST','PRODUCT',p_product_id::text,p_branch_id,
    jsonb_build_object(
      'quantity_before',coalesce(v_before,0),
      'quantity_after',p_quantity,
      'minimum_stock',p_minimum_stock,
      'reason',v_reason,
      'role',v_role
    ),
    auth.uid()
  );

  return v_inventory;
end;
$$;

revoke all on function public.set_branch_product_stock(
  uuid,uuid,numeric,numeric,text
) from public;
grant execute on function public.set_branch_product_stock(
  uuid,uuid,numeric,numeric,text
) to authenticated;

create or replace function public.void_sale_phase_9_2(
  p_sale_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public
as $$
declare
  v_sale public.sales%rowtype;
  v_reason text := btrim(coalesce(p_reason,''));
  v_role text := public.current_app_role();
  v_item record;
  v_restored jsonb := '[]'::jsonb;
begin
  if v_role not in ('owner','admin','manager','supervisor') then
    raise exception 'ไม่มีสิทธิ์ยกเลิกบิล';
  end if;

  if length(v_reason)<5 then
    raise exception 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร';
  end if;

  select * into v_sale
  from public.sales
  where id=p_sale_id
  for update;

  if not found then raise exception 'ไม่พบบิล'; end if;

  if upper(v_sale.status::text)='VOIDED' then
    raise exception 'บิลนี้ถูกยกเลิกแล้ว';
  end if;

  -- Restore only quantities that have not already been returned.
  for v_item in
    select
      product_id,
      product_name,
      returnable_quantity
    from public.sale_item_return_balance
    where sale_id=p_sale_id
      and returnable_quantity>0
  loop
    insert into public.branch_inventory(
      branch_id,product_id,quantity,minimum_stock
    )
    values(
      v_sale.branch_id,v_item.product_id,
      v_item.returnable_quantity,0
    )
    on conflict(branch_id,product_id) do update
    set quantity=public.branch_inventory.quantity
          + excluded.quantity,
        updated_at=now();

    v_restored := v_restored || jsonb_build_array(
      jsonb_build_object(
        'product_id',v_item.product_id,
        'product_name',v_item.product_name,
        'quantity',v_item.returnable_quantity
      )
    );
  end loop;

  update public.sales
  set status='VOIDED'::public.sale_status,
      voided_by=auth.uid(),
      voided_at=now(),
      notes=concat_ws(
        E'\n',nullif(notes,''),
        '[VOID] '||v_reason
      ),
      updated_at=now()
  where id=p_sale_id;

  insert into public.app_action_logs(
    action,entity_type,entity_id,branch_id,details,created_by
  )
  values(
    'VOID_SALE','SALE',p_sale_id::text,v_sale.branch_id,
    jsonb_build_object(
      'sale_no',v_sale.sale_no,
      'previous_status',v_sale.status::text,
      'reason',v_reason,
      'role',v_role,
      'stock_restored',v_restored
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'success',true,
    'sale_id',p_sale_id,
    'sale_no',v_sale.sale_no,
    'status','VOIDED',
    'stock_restored',v_restored
  );
end;
$$;

revoke all on function public.void_sale_phase_9_2(uuid,text) from public;
grant execute on function public.void_sale_phase_9_2(uuid,text)
to authenticated;

create or replace function public.get_sales_control_dashboard_v2_1(
  p_period text default 'DAY',
  p_anchor_date date default current_date,
  p_branch_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_period text := upper(coalesce(p_period, 'DAY'));
  v_result jsonb;
begin
  if v_period = 'YEAR' then
    v_start := date_trunc('year', p_anchor_date::timestamp);
    v_end := v_start + interval '1 year';
  elsif v_period = 'MONTH' then
    v_start := date_trunc('month', p_anchor_date::timestamp);
    v_end := v_start + interval '1 month';
  else
    v_period := 'DAY';
    v_start := p_anchor_date::timestamp;
    v_end := v_start + interval '1 day';
  end if;

  with filtered_sales as (
    select s.*
    from public.sales s
    where s.created_at >= v_start
      and s.created_at < v_end
      and (p_branch_id is null or s.branch_id = p_branch_id)
  ),
  active_sales as (
    select * from filtered_sales
    where upper(status::text) <> 'VOIDED'
  ),
  summary as (
    select
      count(*)::bigint as bill_count,
      coalesce(sum(net_total), 0)::numeric as gross_revenue,
      coalesce(sum(case when upper(payment_method::text) = 'CASH' then net_total else 0 end), 0)::numeric as cash_revenue,
      coalesce(sum(case when upper(payment_method::text) in ('QR','TRANSFER') then net_total else 0 end), 0)::numeric as qr_transfer_revenue,
      coalesce(sum(case when upper(payment_method::text) = 'CARD' then net_total else 0 end), 0)::numeric as card_revenue,
      coalesce(avg(net_total), 0)::numeric as average_bill
    from active_sales
  ),
  void_summary as (
    select count(*)::bigint as void_count,
           coalesce(sum(net_total),0)::numeric as void_amount
    from filtered_sales
    where upper(status::text) = 'VOIDED'
  ),
  return_summary as (
    select count(*)::bigint as return_count,
           coalesce(sum(sr.refund_amount),0)::numeric as return_amount
    from public.sales_returns sr
    where sr.created_at >= v_start
      and sr.created_at < v_end
      and (p_branch_id is null or sr.branch_id = p_branch_id)
      and upper(sr.status::text) <> 'VOIDED'
  ),
  bills as (
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) as rows
    from (
      select
        s.id,
        s.sale_no,
        s.created_at,
        s.branch_id,
        s.status::text as status,
        s.payment_method::text as payment_method,
        s.subtotal,
        s.discount_amount,
        s.net_total,
        s.received_amount,
        s.change_amount,
        s.customer_name,
        s.customer_phone
      from filtered_sales s
      order by s.created_at desc
      limit greatest(1, least(coalesce(p_limit,100),500))
    ) x
  ),
  items as (
    select jsonb_agg(to_jsonb(x) order by x.sale_id, x.product_name) as rows
    from (
      select
        rb.sale_id,
        rb.product_id,
        rb.product_code,
        rb.barcode,
        rb.product_name,
        rb.sold_quantity,
        rb.returned_quantity,
        rb.returnable_quantity,
        rb.unit_price,
        (rb.sold_quantity * rb.unit_price)::numeric as line_amount
      from public.sale_item_return_balance rb
      join filtered_sales fs on fs.id = rb.sale_id
    ) x
  ),
  trend as (
    select jsonb_agg(to_jsonb(x) order by x.bucket_date) as rows
    from (
      select
        case
          when v_period = 'YEAR' then date_trunc('month', s.created_at)::date
          else s.created_at::date
        end as bucket_date,
        count(*)::bigint as bill_count,
        coalesce(sum(case when upper(s.status::text) <> 'VOIDED' then s.net_total else 0 end),0)::numeric as revenue
      from filtered_sales s
      group by 1
      order by 1
    ) x
  )
  select jsonb_build_object(
    'period', jsonb_build_object('type',v_period,'start',v_start,'end',v_end),
    'summary', (select to_jsonb(summary) from summary),
    'voids', (select to_jsonb(void_summary) from void_summary),
    'returns', (select to_jsonb(return_summary) from return_summary),
    'bills', coalesce((select rows from bills),'[]'::jsonb),
    'items', coalesce((select rows from items),'[]'::jsonb),
    'trend', coalesce((select rows from trend),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_sales_control_dashboard_v2_1(text,date,uuid,integer) from public;
grant execute on function public.get_sales_control_dashboard_v2_1(text,date,uuid,integer) to authenticated;

commit;
