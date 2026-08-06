-- ============================================================
-- TKN v5.26.2 — POS INLINE BOX SALE / CASHIER-CONTROLLED
-- INSTALL: additive only. No core-table data mutation or core triggers.
-- Runtime sale functions modify stock only after explicit confirmation.
-- ============================================================
begin;
do $$ begin
  if to_regclass('public.cashier_shifts') is null or to_regclass('public.cashier_profiles') is null then raise exception 'ไม่พบระบบรหัสพนักงาน/PIN'; end if;
  if to_regclass('public.app_user_roles') is null or to_regclass('public.app_roles') is null or to_regclass('public.app_role_permissions') is null or to_regclass('public.app_permissions') is null then raise exception 'ไม่พบระบบสิทธิ์'; end if;
  if to_regprocedure('public.user_has_permission(text,uuid)') is null then raise exception 'ไม่พบ user_has_permission(text,uuid)'; end if;
  if to_regprocedure('public.tkn_v5261_box_sale_start(uuid)') is null or to_regprocedure('public.tkn_v5261_complete_box_sale(uuid,text,numeric,text,numeric,text,text,text)') is null then raise exception 'กรุณาติดตั้ง v5.26.1 DB-SAFE ก่อน'; end if;
  if to_regprocedure('public.create_pos_sale(uuid,jsonb,numeric,text,numeric,text,text,text)') is null then raise exception 'ไม่พบ create_pos_sale ของ POS เดิม'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='cashier_shifts' and column_name='opened_by')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='cashier_profiles' and column_name='display_name')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_roles' and column_name='id')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_roles' and column_name='sort_order')
  then raise exception 'โครงสร้าง Cashier/RBAC ไม่ตรงกับฐาน v5.26.1 กรุณาหยุดและตรวจ Preflight'; end if;
end $$;

create or replace function public.tkn_v5262_cashier_box_sale_access(p_shift_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_shift public.cashier_shifts%rowtype;v_profile public.cashier_profiles%rowtype;v_role text;v_role_name text;v_permissions text[];
begin
  select * into v_shift from public.cashier_shifts where id=p_shift_id and status='OPEN';
  if not found then return jsonb_build_object('allowed',false,'can_create',false,'message','ไม่พบกะที่เปิดอยู่'); end if;
  if coalesce(v_shift.opened_by,v_shift.cashier_user_id)<>auth.uid() and v_shift.cashier_user_id<>auth.uid() then return jsonb_build_object('allowed',false,'can_create',false,'message','กะนี้ไม่ได้เปิดจากบัญชีระบบปัจจุบัน'); end if;
  select * into v_profile from public.cashier_profiles where user_id=v_shift.cashier_user_id and employee_code=v_shift.employee_code and is_active=true;
  if not found then return jsonb_build_object('allowed',false,'can_create',false,'message','รหัสพนักงานถูกปิดใช้งานหรือไม่พบข้อมูล'); end if;
  if v_profile.branch_id is not null and v_profile.branch_id<>v_shift.branch_id then return jsonb_build_object('allowed',false,'can_create',false,'message','รหัสพนักงานไม่ได้รับสิทธิ์ในสาขาของกะนี้'); end if;
  select r.code,r.name_th into v_role,v_role_name from public.app_user_roles ur join public.app_roles r on r.id=ur.role_id where ur.user_id=v_shift.cashier_user_id and ur.is_active=true and r.is_active=true order by r.sort_order nulls last,r.code limit 1;
  select coalesce(array_agg(distinct p.code order by p.code),array[]::text[]) into v_permissions from public.app_user_roles ur join public.app_roles r on r.id=ur.role_id and r.is_active=true join public.app_role_permissions rp on rp.role_id=ur.role_id join public.app_permissions p on p.id=rp.permission_id where ur.user_id=v_shift.cashier_user_id and ur.is_active=true and p.code like 'pos.box_sale.%';
  return jsonb_build_object('allowed',public.user_has_permission('pos.box_sale.create',v_shift.cashier_user_id),'can_create',public.user_has_permission('pos.box_sale.create',v_shift.cashier_user_id),'can_lump_price',public.user_has_permission('pos.box_sale.lump_price',v_shift.cashier_user_id),'can_below_cost',public.user_has_permission('pos.box_sale.below_cost',v_shift.cashier_user_id),'can_cancel',public.user_has_permission('pos.box_sale.cancel',v_shift.cashier_user_id),'permissions',to_jsonb(v_permissions),'role',coalesce(v_role,'staff'),'role_name_th',coalesce(v_role_name,'พนักงาน'),'cashier_user_id',v_shift.cashier_user_id,'employee_code',v_shift.employee_code,'display_name',v_profile.display_name,'shift_id',v_shift.id,'branch_id',v_shift.branch_id,'message',case when public.user_has_permission('pos.box_sale.create',v_shift.cashier_user_id) then 'อนุญาตขายยกกล่อง' else 'รหัสพนักงานนี้ไม่มีสิทธิ์ขายยกกล่อง' end);
end $$;

create or replace function public.tkn_v5262_cashier_box_sale_assert(p_shift_id uuid,p_permission text default 'pos.box_sale.create')
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_access jsonb;v_user_id uuid;
begin
  if p_permission is null or p_permission not like 'pos.box_sale.%' then raise exception 'Permission ไม่ถูกต้อง'; end if;
  v_access:=public.tkn_v5262_cashier_box_sale_access(p_shift_id);
  if coalesce((v_access->>'can_create')::boolean,false)=false then return jsonb_build_object('allowed',false,'permission',p_permission,'message',coalesce(v_access->>'message','ไม่มีสิทธิ์ขายยกกล่อง')); end if;
  v_user_id:=(v_access->>'cashier_user_id')::uuid;
  if not public.user_has_permission(p_permission,v_user_id) then return jsonb_build_object('allowed',false,'permission',p_permission,'message',case p_permission when 'pos.box_sale.lump_price' then 'รหัสพนักงานนี้ไม่มีสิทธิ์กำหนดราคาเหมา' when 'pos.box_sale.below_cost' then 'รหัสพนักงานนี้ไม่มีสิทธิ์ขายต่ำกว่าต้นทุน' when 'pos.box_sale.cancel' then 'รหัสพนักงานนี้ไม่มีสิทธิ์ยกเลิกร่างขาย' else 'รหัสพนักงานนี้ไม่มีสิทธิ์ขายยกกล่อง' end); end if;
  return jsonb_build_object('allowed',true,'permission',p_permission,'cashier_user_id',v_user_id,'employee_code',v_access->>'employee_code','display_name',v_access->>'display_name','role',v_access->>'role','branch_id',v_access->>'branch_id','shift_id',v_access->>'shift_id');
end $$;

create table if not exists public.tkn_v5262_box_sale_draft_shifts(
 draft_id uuid primary key references public.tkn_v5261_box_sale_drafts(id) on delete cascade,
 cashier_shift_id uuid not null references public.cashier_shifts(id) on delete restrict,
 cashier_user_id uuid not null references auth.users(id) on delete restrict,
 employee_code text not null,
 branch_id uuid not null references public.branches(id) on delete restrict,
 created_at timestamptz not null default now()
);
alter table public.tkn_v5262_box_sale_draft_shifts enable row level security;
revoke all on table public.tkn_v5262_box_sale_draft_shifts from public,authenticated;

create or replace function public.tkn_v5262_box_sale_start(p_shift_id uuid,p_branch_id uuid)
returns uuid language plpgsql volatile security definer set search_path=''
as $$
declare v_access jsonb;v_id uuid;v_branch uuid;
begin
 v_access:=public.tkn_v5262_cashier_box_sale_assert(p_shift_id,'pos.box_sale.create');if coalesce((v_access->>'allowed')::boolean,false)=false then raise exception '%',coalesce(v_access->>'message','ไม่มีสิทธิ์ขายยกกล่อง');end if;
 v_branch:=(v_access->>'branch_id')::uuid;if p_branch_id is not null and p_branch_id<>v_branch then raise exception 'สาขาใน POS ไม่ตรงกับสาขาของกะ';end if;
 insert into public.tkn_v5261_box_sale_drafts(branch_id) values(v_branch) returning id into v_id;
 insert into public.tkn_v5262_box_sale_draft_shifts(draft_id,cashier_shift_id,cashier_user_id,employee_code,branch_id) values(v_id,p_shift_id,(v_access->>'cashier_user_id')::uuid,v_access->>'employee_code',v_branch);
 return v_id;
end $$;

create or replace function public.tkn_v5262_box_sale_preview(p_shift_id uuid,p_draft_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_access jsonb;v_draft public.tkn_v5261_box_sale_drafts%rowtype;v_boxes jsonb;v_items jsonb;
begin
 v_access:=public.tkn_v5262_cashier_box_sale_assert(p_shift_id,'pos.box_sale.create');if coalesce((v_access->>'allowed')::boolean,false)=false then raise exception '%',coalesce(v_access->>'message','ไม่มีสิทธิ์ขายยกกล่อง');end if;
 if not exists(select 1 from public.tkn_v5262_box_sale_draft_shifts where draft_id=p_draft_id and cashier_shift_id=p_shift_id) then raise exception 'ร่างขายนี้ไม่ได้ผูกกับรหัสพนักงานที่เปิดกะ';end if;
 select * into v_draft from public.tkn_v5261_box_sale_drafts where id=p_draft_id;if not found then raise exception 'ไม่พบร่างขายยกกล่อง';end if;
 select coalesce(jsonb_agg(jsonb_build_object('box_id',b.id,'box_code',b.box_code,'cycle_id',db.cycle_id,'sku_count',(select count(*) from public.tkn_v5261_box_sale_draft_items di where di.draft_id=db.draft_id and di.box_id=db.box_id),'total_quantity',(select coalesce(sum(quantity),0) from public.tkn_v5261_box_sale_draft_items di where di.draft_id=db.draft_id and di.box_id=db.box_id)) order by db.created_at),'[]'::jsonb) into v_boxes from public.tkn_v5261_box_sale_draft_boxes db join public.stock_boxes b on b.id=db.box_id where db.draft_id=p_draft_id;
 select coalesce(jsonb_agg(jsonb_build_object('product_id',q.product_id,'sku',q.sku,'product_name',q.product_name,'quantity',q.quantity,'unit_cost',q.unit_cost,'unit_price',q.unit_price,'cost_total',round(q.quantity*q.unit_cost,2),'normal_total',round(q.quantity*q.unit_price,2)) order by q.sku),'[]'::jsonb) into v_items from (select product_id,sku,max(product_name_snapshot) product_name,sum(quantity) quantity,case when sum(quantity)=0 then 0 else sum(quantity*unit_cost_snapshot)/sum(quantity) end unit_cost,case when sum(quantity)=0 then 0 else sum(quantity*unit_price_snapshot)/sum(quantity) end unit_price from public.tkn_v5261_box_sale_draft_items where draft_id=p_draft_id group by product_id,sku)q;
 return jsonb_build_object('draft',jsonb_build_object('id',v_draft.id,'branch_id',v_draft.branch_id,'status',v_draft.status,'lock_expires_at',v_draft.lock_expires_at),'boxes',v_boxes,'items',v_items,'box_count',jsonb_array_length(v_boxes),'sku_count',jsonb_array_length(v_items),'total_quantity',coalesce((select sum(quantity) from public.tkn_v5261_box_sale_draft_items where draft_id=p_draft_id),0),'cost_total',round(coalesce((select sum(quantity*unit_cost_snapshot) from public.tkn_v5261_box_sale_draft_items where draft_id=p_draft_id),0),2),'normal_price_total',round(coalesce((select sum(quantity*unit_price_snapshot) from public.tkn_v5261_box_sale_draft_items where draft_id=p_draft_id),0),2));
end $$;

create or replace function public.tkn_v5262_box_sale_add_box(p_shift_id uuid,p_draft_id uuid,p_box_code text)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_access jsonb;v_draft public.tkn_v5261_box_sale_drafts%rowtype;v_box public.stock_boxes%rowtype;v_tracking public.tkn_v5261_box_tracking;v_cycle uuid;v_hash text;
begin
 v_access:=public.tkn_v5262_cashier_box_sale_assert(p_shift_id,'pos.box_sale.create');if coalesce((v_access->>'allowed')::boolean,false)=false then raise exception '%',v_access->>'message';end if;
 if not exists(select 1 from public.tkn_v5262_box_sale_draft_shifts where draft_id=p_draft_id and cashier_shift_id=p_shift_id) then raise exception 'ร่างขายนี้ไม่ได้ผูกกับรหัสพนักงานที่เปิดกะ';end if;
 select * into v_draft from public.tkn_v5261_box_sale_drafts where id=p_draft_id for update;if not found or v_draft.status<>'DRAFT' then raise exception 'ร่างขายไม่พร้อมใช้งาน';end if;if v_draft.lock_expires_at<now() then raise exception 'ร่างขายหมดเวลา';end if;if v_draft.branch_id<>(v_access->>'branch_id')::uuid then raise exception 'สาขาของร่างขายไม่ตรงกับกะ';end if;
 select * into v_box from public.stock_boxes where upper(box_code)=upper(btrim(p_box_code)) for update;if not found then raise exception 'ไม่พบกล่อง %',p_box_code;end if;if upper(coalesce(v_box.status::text,''))<>'CLOSED' then raise exception 'กล่องต้องอยู่ในสถานะปิดแล้ว';end if;
 v_tracking:=public.tkn_v5261_ensure_tracking(v_box.id,v_draft.branch_id);if v_tracking.active_transfer_id is not null or v_tracking.location_state='IN_TRANSIT' then raise exception 'กล่องกำลังอยู่ระหว่างส่ง';end if;if v_tracking.branch_id is not null and v_tracking.branch_id<>v_draft.branch_id then raise exception 'ห้ามรวมกล่องจากคนละสาขา';end if;perform public.tkn_v5261_assert_box_items(v_box.id);
 if exists(select 1 from public.tkn_v5261_box_sale_draft_boxes where draft_id=p_draft_id and box_id=v_box.id) then raise exception 'สแกนกล่องนี้แล้ว';end if;
 if exists(select 1 from public.tkn_v5261_box_sale_draft_boxes db join public.tkn_v5261_box_sale_drafts d on d.id=db.draft_id where db.box_id=v_box.id and d.id<>p_draft_id and d.status='DRAFT' and d.lock_expires_at>now()) then raise exception 'กล่องถูกล็อกอยู่ในรายการขายอื่น';end if;
 update public.tkn_v5261_box_tracking set branch_id=v_draft.branch_id,location_state='WAREHOUSE',updated_at=now() where box_id=v_box.id;v_cycle:=public.tkn_v5261_ensure_cycle(v_box.id,v_draft.branch_id);perform public.tkn_v5261_sync_cycle_items(v_cycle,v_box.id);v_hash:=public.tkn_v5261_box_hash(v_box.id);
 insert into public.tkn_v5261_box_sale_draft_boxes(draft_id,box_id,cycle_id,item_hash) values(p_draft_id,v_box.id,v_cycle,v_hash);
 insert into public.tkn_v5261_box_sale_draft_items(draft_id,box_id,cycle_id,product_id,sku,product_name_snapshot,lot_code_snapshot,quantity,unit_cost_snapshot,unit_price_snapshot) select p_draft_id,v_box.id,v_cycle,i.product_id,i.sku,p.name,p.lot_code,i.quantity,coalesce(p.cost_price,0),coalesce(p.selling_price,0) from public.stock_box_items i join public.products p on p.id=i.product_id where i.box_id=v_box.id and i.quantity>0;
 update public.tkn_v5261_box_sale_drafts set lock_expires_at=now()+interval '30 minutes',updated_at=now() where id=p_draft_id;return public.tkn_v5262_box_sale_preview(p_shift_id,p_draft_id);
end $$;

create or replace function public.tkn_v5262_box_sale_remove_box(p_shift_id uuid,p_draft_id uuid,p_box_code text)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_access jsonb;v_box_id uuid;
begin
 v_access:=public.tkn_v5262_cashier_box_sale_assert(p_shift_id,'pos.box_sale.create');if coalesce((v_access->>'allowed')::boolean,false)=false then raise exception '%',v_access->>'message';end if;
 if not exists(select 1 from public.tkn_v5262_box_sale_draft_shifts where draft_id=p_draft_id and cashier_shift_id=p_shift_id) then raise exception 'ร่างขายนี้ไม่ได้ผูกกับรหัสพนักงานที่เปิดกะ';end if;
 if not exists(select 1 from public.tkn_v5261_box_sale_drafts where id=p_draft_id and status='DRAFT') then raise exception 'ไม่พบร่างขายที่แก้ไขได้';end if;
 select id into v_box_id from public.stock_boxes where upper(box_code)=upper(btrim(p_box_code));delete from public.tkn_v5261_box_sale_draft_items where draft_id=p_draft_id and box_id=v_box_id;delete from public.tkn_v5261_box_sale_draft_boxes where draft_id=p_draft_id and box_id=v_box_id;update public.tkn_v5261_box_sale_drafts set lock_expires_at=now()+interval '30 minutes',updated_at=now() where id=p_draft_id;return public.tkn_v5262_box_sale_preview(p_shift_id,p_draft_id);
end $$;

create or replace function public.tkn_v5262_box_sale_cancel(p_shift_id uuid,p_draft_id uuid)
returns boolean language plpgsql volatile security definer set search_path=''
as $$
declare v_access jsonb;
begin v_access:=public.tkn_v5262_cashier_box_sale_assert(p_shift_id,'pos.box_sale.create');if coalesce((v_access->>'allowed')::boolean,false)=false then raise exception '%',v_access->>'message';end if;update public.tkn_v5261_box_sale_drafts d set status='CANCELLED',updated_at=now() where d.id=p_draft_id and d.status='DRAFT' and exists(select 1 from public.tkn_v5262_box_sale_draft_shifts l where l.draft_id=d.id and l.cashier_shift_id=p_shift_id);return found;end $$;

create or replace function public.tkn_v5262_complete_box_sale(p_shift_id uuid,p_draft_id uuid,p_pricing_mode text,p_lump_price numeric default null,p_payment_method text default 'CASH',p_received_amount numeric default 0,p_customer_name text default null,p_customer_phone text default null,p_notes text default null)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_access jsonb;v_draft public.tkn_v5261_box_sale_drafts%rowtype;v_sale public.sales%rowtype;v_mode text:=upper(btrim(p_pricing_mode));v_cost numeric(14,2);v_normal numeric(14,2);v_target numeric(14,2);v_weight_total numeric;v_allocated numeric(14,2):=0;v_line numeric(14,2);v_unit numeric(14,2);v_line_discount numeric(14,2);v_count integer;v_index integer:=0;v_box_count integer;v_sku_count integer;v_qty numeric;v_pos_items jsonb:='[]'::jsonb;v_box_sale_id uuid;r record;b record;
begin
 v_access:=public.tkn_v5262_cashier_box_sale_assert(p_shift_id,'pos.box_sale.create');if coalesce((v_access->>'allowed')::boolean,false)=false then raise exception '%',v_access->>'message';end if;if v_mode not in('SKU','LUMP')then raise exception 'รูปแบบราคาไม่ถูกต้อง';end if;if v_mode='LUMP' and coalesce((public.tkn_v5262_cashier_box_sale_assert(p_shift_id,'pos.box_sale.lump_price')->>'allowed')::boolean,false)=false then raise exception 'รหัสพนักงานนี้ไม่มีสิทธิ์กำหนดราคาเหมา';end if;if not exists(select 1 from public.tkn_v5262_box_sale_draft_shifts where draft_id=p_draft_id and cashier_shift_id=p_shift_id)then raise exception 'ร่างขายนี้ไม่ได้ผูกกับรหัสพนักงานที่เปิดกะ';end if;
 select * into v_draft from public.tkn_v5261_box_sale_drafts where id=p_draft_id for update;if not found or v_draft.status<>'DRAFT'then raise exception 'ร่างขายไม่พร้อมใช้งาน';end if;if v_draft.lock_expires_at<now()then raise exception 'ร่างขายหมดเวลา';end if;if v_draft.branch_id<>(v_access->>'branch_id')::uuid then raise exception 'สาขาของร่างขายไม่ตรงกับกะ';end if;
 select count(*),count(distinct product_id),coalesce(sum(quantity),0),round(coalesce(sum(quantity*unit_cost_snapshot),0),2),round(coalesce(sum(quantity*unit_price_snapshot),0),2) into v_count,v_sku_count,v_qty,v_cost,v_normal from public.tkn_v5261_box_sale_draft_items where draft_id=p_draft_id;select count(*)into v_box_count from public.tkn_v5261_box_sale_draft_boxes where draft_id=p_draft_id;if v_box_count=0 or v_count=0 then raise exception 'ยังไม่ได้สแกนกล่อง';end if;
 for b in select db.box_id,db.item_hash,sb.box_code,sb.status,t.location_state,t.branch_id,t.active_transfer_id from public.tkn_v5261_box_sale_draft_boxes db join public.stock_boxes sb on sb.id=db.box_id left join public.tkn_v5261_box_tracking t on t.box_id=db.box_id where db.draft_id=p_draft_id order by db.box_id for update of sb loop if upper(coalesce(b.status::text,''))<>'CLOSED'then raise exception 'กล่อง % ไม่พร้อมขายแล้ว',b.box_code;end if;if coalesce(b.location_state,'WAREHOUSE')<>'WAREHOUSE'or b.active_transfer_id is not null then raise exception 'กล่อง % ไม่อยู่ในคลัง',b.box_code;end if;if b.branch_id is not null and b.branch_id<>v_draft.branch_id then raise exception 'กล่อง % ถูกย้ายสาขาแล้ว',b.box_code;end if;if public.tkn_v5261_box_hash(b.box_id)<>b.item_hash then raise exception 'สินค้าในกล่อง % เปลี่ยนแปลง กรุณาสแกนใหม่',b.box_code;end if;end loop;
 v_target:=case when v_mode='SKU'then v_normal else round(coalesce(p_lump_price,0),2)end;if v_target<0 then raise exception 'ราคาขายต้องไม่น้อยกว่า 0';end if;if v_target<v_cost and coalesce((public.tkn_v5262_cashier_box_sale_assert(p_shift_id,'pos.box_sale.below_cost')->>'allowed')::boolean,false)=false then raise exception 'ราคาขายต่ำกว่าต้นทุน ต้องใช้รหัส Owner หรือ Admin';end if;
 select count(*)into v_count from(select product_id from public.tkn_v5261_box_sale_draft_items where draft_id=p_draft_id group by product_id)x;v_weight_total:=case when v_normal>0 then v_normal when v_cost>0 then v_cost else v_qty end;
 for r in select product_id,max(sku)sku,sum(quantity)quantity,sum(quantity*unit_cost_snapshot)cost_total,sum(quantity*unit_price_snapshot)normal_total from public.tkn_v5261_box_sale_draft_items where draft_id=p_draft_id group by product_id order by product_id loop v_index:=v_index+1;if v_mode='SKU'then v_line:=round(r.normal_total,2);elsif v_index=v_count then v_line:=v_target-v_allocated;else v_line:=round(v_target*(case when v_normal>0 then r.normal_total when v_cost>0 then r.cost_total else r.quantity end)/nullif(v_weight_total,0),2);v_allocated:=v_allocated+v_line;end if;if r.quantity<=0 then raise exception 'จำนวนสินค้าไม่ถูกต้อง';end if;v_unit:=ceil((v_line/r.quantity)*100)/100;v_line_discount:=round((v_unit*r.quantity)-v_line,2);if v_line_discount<0 then v_line_discount:=0;end if;v_pos_items:=v_pos_items||jsonb_build_array(jsonb_build_object('product_id',r.product_id,'quantity',r.quantity,'unit_price',v_unit,'discount_amount',v_line_discount));end loop;
 select * into v_sale from public.create_pos_sale(v_draft.branch_id,v_pos_items,0,p_payment_method,p_received_amount,p_customer_name,p_customer_phone,concat_ws(E'\n',nullif(btrim(p_notes),''),'ขายยกกล่อง '||v_box_count||' กล่อง · '||v_mode,'พนักงาน '||coalesce(v_access->>'display_name',v_access->>'employee_code')||' · '||coalesce(v_access->>'employee_code','-')||' · กะ '||p_shift_id::text));
 insert into public.tkn_v5261_box_sales(sale_id,draft_id,branch_id,pricing_mode,box_count,sku_count,total_quantity,normal_price_total,cost_total,sale_total,gross_profit)values(v_sale.id,p_draft_id,v_draft.branch_id,v_mode,v_box_count,v_sku_count,v_qty,v_normal,v_cost,v_sale.net_total,v_sale.net_total-v_cost)returning id into v_box_sale_id;
 insert into public.tkn_v5261_box_sale_items(box_sale_id,product_id,sku,quantity,unit_cost_snapshot,cost_total,normal_price_total,allocated_sale_total)select v_box_sale_id,di.product_id,max(di.sku),sum(di.quantity),case when sum(di.quantity)=0 then 0 else sum(di.quantity*di.unit_cost_snapshot)/sum(di.quantity)end,round(sum(di.quantity*di.unit_cost_snapshot),2),round(sum(di.quantity*di.unit_price_snapshot),2),coalesce(max(si.line_total),0)from public.tkn_v5261_box_sale_draft_items di left join public.sale_items si on si.sale_id=v_sale.id and si.product_id=di.product_id where di.draft_id=p_draft_id group by di.product_id;
 for b in select db.box_id,db.cycle_id,sb.box_code from public.tkn_v5261_box_sale_draft_boxes db join public.stock_boxes sb on sb.id=db.box_id where db.draft_id=p_draft_id order by db.box_id loop insert into public.tkn_v5261_box_sale_boxes(box_sale_id,box_id,cycle_id)values(v_box_sale_id,b.box_id,b.cycle_id);delete from public.stock_box_items where box_id=b.box_id;update public.stock_boxes set status='DRAFT',closed_at=null where id=b.box_id;update public.tkn_v5261_box_cycles set status='SOLD',completed_at=now(),metadata=metadata||jsonb_build_object('sale_id',v_sale.id,'cashier_shift_id',p_shift_id,'employee_code',v_access->>'employee_code')where id=b.cycle_id;update public.tkn_v5261_box_tracking set location_state='EMPTY',active_transfer_id=null,active_cycle_id=null,updated_at=now()where box_id=b.box_id;insert into public.tkn_v5261_box_movements(box_id,cycle_id,action,from_branch_id,to_branch_id,from_location,to_location,sale_id,detail)values(b.box_id,b.cycle_id,'BOX_SOLD',v_draft.branch_id,v_draft.branch_id,'WAREHOUSE','EMPTY',v_sale.id,jsonb_build_object('sale_no',v_sale.sale_no,'pricing_mode',v_mode,'cashier_shift_id',p_shift_id,'employee_code',v_access->>'employee_code'));end loop;
 update public.tkn_v5261_box_sale_drafts set status='COMPLETED',pricing_mode=v_mode,lump_price=case when v_mode='LUMP'then v_sale.net_total else null end,sale_id=v_sale.id,updated_at=now()where id=p_draft_id;
 return jsonb_build_object('sale_id',v_sale.id,'sale_no',v_sale.sale_no,'box_sale_id',v_box_sale_id,'pricing_mode',v_mode,'box_count',v_box_count,'sku_count',v_sku_count,'total_quantity',v_qty,'cost_total',v_cost,'normal_price_total',v_normal,'net_total',v_sale.net_total,'gross_profit',v_sale.net_total-v_cost,'received_amount',v_sale.received_amount,'change_amount',v_sale.change_amount,'employee_code',v_access->>'employee_code','cashier_shift_id',p_shift_id);
end $$;

revoke all on function public.tkn_v5262_cashier_box_sale_access(uuid) from public;revoke all on function public.tkn_v5262_cashier_box_sale_assert(uuid,text) from public;revoke all on function public.tkn_v5262_box_sale_start(uuid,uuid) from public;revoke all on function public.tkn_v5262_box_sale_preview(uuid,uuid) from public;revoke all on function public.tkn_v5262_box_sale_add_box(uuid,uuid,text) from public;revoke all on function public.tkn_v5262_box_sale_remove_box(uuid,uuid,text) from public;revoke all on function public.tkn_v5262_box_sale_cancel(uuid,uuid) from public;revoke all on function public.tkn_v5262_complete_box_sale(uuid,uuid,text,numeric,text,numeric,text,text,text) from public;
grant execute on function public.tkn_v5262_cashier_box_sale_access(uuid) to authenticated;grant execute on function public.tkn_v5262_cashier_box_sale_assert(uuid,text) to authenticated;grant execute on function public.tkn_v5262_box_sale_start(uuid,uuid) to authenticated;grant execute on function public.tkn_v5262_box_sale_preview(uuid,uuid) to authenticated;grant execute on function public.tkn_v5262_box_sale_add_box(uuid,uuid,text) to authenticated;grant execute on function public.tkn_v5262_box_sale_remove_box(uuid,uuid,text) to authenticated;grant execute on function public.tkn_v5262_box_sale_cancel(uuid,uuid) to authenticated;grant execute on function public.tkn_v5262_complete_box_sale(uuid,uuid,text,numeric,text,numeric,text,text,text) to authenticated;
commit;
