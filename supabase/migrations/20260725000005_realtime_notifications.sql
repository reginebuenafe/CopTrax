-- Enable Realtime replication for the notifications table
-- so the NotificationBell component can receive live inserts.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
