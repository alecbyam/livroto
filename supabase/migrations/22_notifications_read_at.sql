-- Notifications in-app : état lu/non-lu pour la cloche
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_notif_user_unread
  ON public.notifications(user_id, created_at DESC) WHERE channel = 'in_app';
