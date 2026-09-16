-- Read-only deployment checks. Run after the combined INSTALL file.
SELECT 'lookup_version' AS check_name, EXISTS (
 SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.find_product_by_barcode(text)')
 AND NOT prosecdef
 AND md5(btrim(replace(prosrc,chr(13),''),E' \t\r\n'))='dcdf88add36df0a0fdc2b2ef5668f541'
) AS passed
UNION ALL
SELECT 'packing_guard_enabled', EXISTS (
 SELECT 1 FROM pg_trigger WHERE tgrelid='public.stock_box_items'::regclass
 AND tgname='tkn_box_product_guard_v53131' AND tgenabled='O'
 AND tgfoid=to_regprocedure('public.tkn_box_product_guard_v53131()')
 AND EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=tgfoid AND NOT p.prosecdef
   AND md5(btrim(replace(p.prosrc,chr(13),''),E' \t\r\n'))='01a0481b282f0a7e9cac2de85115b4ea')
)
UNION ALL
SELECT 'authenticated_lookup_table_access',
 has_table_privilege('authenticated','public.products','SELECT')
 AND has_table_privilege('authenticated','public.product_list','SELECT')
 AND has_table_privilege('authenticated','public.tkn_product_barcode_master','SELECT');
