
-- Enums
CREATE TYPE public.app_role AS ENUM ('customer', 'vendor', 'rider', 'admin');
CREATE TYPE public.product_category AS ENUM ('phone_accessories', 'local_food', 'delivery_service');
CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'ready', 'picked_up', 'delivered', 'cancelled');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  zone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Auto-create profile + customer role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''), NEW.raw_user_meta_data->>'phone');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Zones
CREATE TABLE public.zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  delivery_fee_usd NUMERIC(6,2) NOT NULL DEFAULT 2,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.zones TO anon, authenticated;
GRANT ALL ON public.zones TO service_role;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zones_public_read" ON public.zones FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "zones_admin_all" ON public.zones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.zones (name, delivery_fee_usd) VALUES
  ('Centre-ville', 2), ('Sayo', 3), ('Lumumba', 3), ('Bankoko', 3),
  ('Mudzi Pela', 5), ('Nyakasansa', 5), ('Bigo', 5), ('Sukisa', 3);

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category public.product_category NOT NULL,
  price_usd NUMERIC(8,2) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  emoji TEXT,
  image_url TEXT,
  description TEXT,
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_public_read" ON public.products FOR SELECT TO anon, authenticated USING (approved = true);
CREATE POLICY "products_vendor_read_own" ON public.products FOR SELECT TO authenticated USING (vendor_id = auth.uid());
CREATE POLICY "products_vendor_insert" ON public.products FOR INSERT TO authenticated
  WITH CHECK (vendor_id = auth.uid() AND public.has_role(auth.uid(), 'vendor'));
CREATE POLICY "products_vendor_update" ON public.products FOR UPDATE TO authenticated
  USING (vendor_id = auth.uid()) WITH CHECK (vendor_id = auth.uid());
CREATE POLICY "products_vendor_delete" ON public.products FOR DELETE TO authenticated USING (vendor_id = auth.uid());
CREATE POLICY "products_admin_all" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  zone TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rider_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_usd NUMERIC(8,2) NOT NULL,
  delivery_fee NUMERIC(6,2) NOT NULL DEFAULT 2,
  status public.order_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.orders TO anon, authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
-- Public can create orders (cash on delivery, no login required)
CREATE POLICY "orders_anyone_insert" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "orders_customer_read_own" ON public.orders FOR SELECT TO authenticated USING (customer_id = auth.uid());
CREATE POLICY "orders_vendor_read" ON public.orders FOR SELECT TO authenticated USING (vendor_id = auth.uid());
CREATE POLICY "orders_vendor_update" ON public.orders FOR UPDATE TO authenticated USING (vendor_id = auth.uid());
CREATE POLICY "orders_rider_read" ON public.orders FOR SELECT TO authenticated USING (rider_id = auth.uid());
CREATE POLICY "orders_rider_update" ON public.orders FOR UPDATE TO authenticated USING (rider_id = auth.uid());
CREATE POLICY "orders_admin_all" ON public.orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
