-- Perf : index couvrants sur les clés étrangères (joins/suppressions plus rapides à grande échelle)
CREATE INDEX IF NOT EXISTS idx_deliveries_rider_id ON public.deliveries (rider_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_orders_zone_id ON public.orders (zone_id);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON public.orders (product_id);
CREATE INDEX IF NOT EXISTS idx_products_vendor_id ON public.products (vendor_id);
CREATE INDEX IF NOT EXISTS idx_rider_zones_zone_id ON public.rider_zones (zone_id);
CREATE INDEX IF NOT EXISTS idx_vendor_zones_zone_id ON public.vendor_zones (zone_id);
CREATE INDEX IF NOT EXISTS idx_vendors_base_zone_id ON public.vendors (base_zone_id);
