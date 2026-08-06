-- ============================================================
-- TKN v5.26.1 DB-SAFE — ROLLBACK NEW OBJECTS ONLY
-- ใช้เมื่อยังไม่ได้เปิดใช้งานจริง หรือยอมรับการลบประวัติ Sidecar v5.26.1 แล้ว
-- ไฟล์นี้ไม่ย้อนรายการขาย/โอน/เบิกที่ทำสำเร็จในตารางหลัก
-- ไม่ DROP/ALTER ตารางหลักของระบบเดิม
-- ============================================================

begin;

-- Public RPCs / helpers added by this patch only
drop function if exists public.tkn_v5261_complete_box_sale(uuid,text,numeric,text,numeric,text,text,text);
drop function if exists public.tkn_v5261_box_sale_cancel(uuid);
drop function if exists public.tkn_v5261_box_sale_remove_box(uuid,text);
drop function if exists public.tkn_v5261_box_sale_add_box(uuid,text);
drop function if exists public.tkn_v5261_box_sale_preview(uuid);
drop function if exists public.tkn_v5261_box_sale_start(uuid);
drop function if exists public.tkn_v5261_receive_whole_box(text,uuid);
drop function if exists public.tkn_v5261_transfer_whole_box(text,uuid,uuid,text);
drop function if exists public.tkn_v5261_issue_box_to_storefront(text,uuid);
drop function if exists public.tkn_v5261_get_box_context(text);
drop function if exists public.tkn_v5261_register_box_location(text,uuid,text);
drop function if exists public.tkn_v5261_box_hash(uuid);
drop function if exists public.tkn_v5261_sync_cycle_items(uuid,uuid);
drop function if exists public.tkn_v5261_ensure_cycle(uuid,uuid);
drop function if exists public.tkn_v5261_ensure_tracking(uuid,uuid);
drop function if exists public.tkn_v5261_effective_location(uuid);
drop function if exists public.tkn_v5261_assert_box_items(uuid);
drop function if exists public.tkn_v5261_resolve_branch(uuid);
drop function if exists public.tkn_v5261_has_permission(text);

drop view if exists public.tkn_v5261_product_stock_position;
drop view if exists public.tkn_v5261_box_item_locations;

drop table if exists public.tkn_v5261_box_sale_items;
drop table if exists public.tkn_v5261_box_sale_boxes;
drop table if exists public.tkn_v5261_box_sales;
drop table if exists public.tkn_v5261_box_sale_draft_items;
drop table if exists public.tkn_v5261_box_sale_draft_boxes;
drop table if exists public.tkn_v5261_box_sale_drafts;
drop table if exists public.tkn_v5261_box_transfer_links;
drop table if exists public.tkn_v5261_box_movements;
drop table if exists public.tkn_v5261_box_cycle_items;
drop table if exists public.tkn_v5261_box_tracking;
drop table if exists public.tkn_v5261_box_cycles;

delete from public.app_role_permissions
where permission_id in (
  select id from public.app_permissions
  where code in (
    'pos.box_sale.create','pos.box_sale.lump_price','pos.box_sale.below_cost',
    'pos.box_sale.cancel','inventory.box_transfer'
  )
);

delete from public.app_permissions
where code in (
  'pos.box_sale.create','pos.box_sale.lump_price','pos.box_sale.below_cost',
  'pos.box_sale.cancel','inventory.box_transfer'
);

commit;
