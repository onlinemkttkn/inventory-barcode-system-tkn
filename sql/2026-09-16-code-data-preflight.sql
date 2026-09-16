-- Read-only, one JSON result. Counts only; no product identifiers returned.
-- Inspect this before planning identifier rewrites or box-code normalization.
WITH identifiers AS (
  SELECT id,product_code AS code FROM public.products
  UNION SELECT id,barcode FROM public.products
  UNION SELECT id,source_barcode FROM public.products
  UNION SELECT p.id,m.barcode FROM public.tkn_product_barcode_master m
    JOIN public.products p ON m.product_id=p.id
      OR (m.product_id IS NULL AND m.internal_sku=p.product_code)
    WHERE m.is_active
), collisions AS (
  SELECT code FROM identifiers WHERE nullif(code,'') IS NOT NULL
  GROUP BY code HAVING count(DISTINCT id)>1
)
SELECT jsonb_build_object(
  'ambiguous_product_identifiers',(SELECT count(*) FROM collisions),
  'products_with_different_barcode',(SELECT count(*) FROM public.products
    WHERE barcode IS DISTINCT FROM product_code),
  'blank_product_codes',(SELECT count(*) FROM public.products
    WHERE nullif(btrim(product_code),'') IS NULL),
  'barcode_master_unresolved',(SELECT count(*) FROM public.tkn_product_barcode_master m
    WHERE m.is_active AND NOT EXISTS (SELECT 1 FROM public.products p
      WHERE p.id=m.product_id OR (m.product_id IS NULL AND p.product_code=m.internal_sku))),
  'short_box_codes',(SELECT count(*) FROM public.stock_boxes
    WHERE box_code ~* '^[A-Z]{2,3}-[A-Z][0-9]{2}$'),
  'nonstandard_box_codes',(SELECT count(*) FROM public.stock_boxes
    WHERE box_code !~ '^TKN-B-[A-Z]{2,3}-[A-Z][0-9]{2}$'),
  'case_or_whitespace_box_collisions',(SELECT count(*) FROM (
    SELECT upper(btrim(box_code)) FROM public.stock_boxes
    GROUP BY upper(btrim(box_code)) HAVING count(*)>1
  ) duplicates),
  'different_history_qr_payloads',(SELECT count(*) FROM public.tkn_box_history
    WHERE qr_payload IS DISTINCT FROM box_code),
  'authenticated_can_read_lookup_dependencies',
    has_table_privilege('authenticated','public.products','SELECT')
    AND has_table_privilege('authenticated','public.product_list','SELECT')
    AND has_table_privilege('authenticated','public.tkn_product_barcode_master','SELECT')
) AS preflight;
