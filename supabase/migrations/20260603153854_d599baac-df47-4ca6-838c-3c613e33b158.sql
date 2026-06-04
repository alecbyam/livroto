
-- 1) Auto stock decrement/restore based on order status transitions
CREATE OR REPLACE FUNCTION public.tg_orders_adjust_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  it RECORD;
  old_consumes BOOLEAN;
  new_consumes BOOLEAN;
BEGIN
  -- consumes stock = order is alive (not pending, not cancelled)
  old_consumes := COALESCE(OLD.status, 'pending') NOT IN ('pending','cancelled');
  new_consumes := COALESCE(NEW.status, 'pending') NOT IN ('pending','cancelled');

  IF old_consumes = new_consumes THEN
    RETURN NEW;
  END IF;

  -- iterate over order_items; fallback to single product_id legacy field
  IF EXISTS (SELECT 1 FROM public.order_items WHERE order_id = NEW.id) THEN
    FOR it IN SELECT product_id, quantity FROM public.order_items WHERE order_id = NEW.id AND product_id IS NOT NULL
    LOOP
      IF new_consumes AND NOT old_consumes THEN
        UPDATE public.products SET stock = GREATEST(stock - it.quantity, 0) WHERE id = it.product_id;
      ELSIF old_consumes AND NOT new_consumes THEN
        UPDATE public.products SET stock = stock + it.quantity WHERE id = it.product_id;
      END IF;
    END LOOP;
  ELSIF NEW.product_id IS NOT NULL THEN
    IF new_consumes AND NOT old_consumes THEN
      UPDATE public.products SET stock = GREATEST(stock - NEW.quantity, 0) WHERE id = NEW.product_id;
    ELSIF old_consumes AND NOT new_consumes THEN
      UPDATE public.products SET stock = stock + NEW.quantity WHERE id = NEW.product_id;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_adjust_stock ON public.orders;
CREATE TRIGGER trg_orders_adjust_stock
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.tg_orders_adjust_stock();

-- 2) Reports / signalements
CREATE TYPE public.report_target AS ENUM ('product','vendor','rider','order');
CREATE TYPE public.report_status AS ENUM ('open','reviewing','resolved','dismissed');

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  target_type public.report_target NOT NULL,
  target_id uuid NOT NULL,
  reason text NOT NULL,
  details text,
  status public.report_status NOT NULL DEFAULT 'open',
  resolved_by uuid,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY reports_insert_own
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY reports_select_own
  ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

CREATE POLICY reports_admin_all
  ON public.reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_reports_updated_at
BEFORE UPDATE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX reports_target_idx ON public.reports(target_type, target_id);
CREATE INDEX reports_status_idx ON public.reports(status);
