-- SAFE DISABLE ONLY: ไม่ลบข้อมูล Lifecycle
begin;
drop trigger if exists trg_tkn_v5284_box_history_event on public.tkn_box_history;
drop trigger if exists trg_tkn_v5284_box_print_event on public.tkn_box_qr_print_history;
drop trigger if exists trg_tkn_v5284_box_intake_event on public.tkn_box_stock_intake_ledger;
revoke execute on function public.tkn_v5284_list_waiting_box_queue(text,integer) from authenticated;
revoke execute on function public.tkn_v5284_box_lifecycle_detail(uuid) from authenticated;
commit;
