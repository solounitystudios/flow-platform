-- Additive fix for the notifications_type_check constraint: the Connections
-- and Messages RPCs (send_connection_request, respond_to_connection_request,
-- send_message) call notify() with 'connection_request', 'connection_accepted',
-- and 'message_received', but the constraint was never widened to permit
-- them when those RPCs were added. Every insert of these types had been
-- failing since, rolling back the whole calling transaction (e.g. Connect
-- taps never created a connections row).
--
-- Reversible: to roll back, repeat this same drop+recreate with the
-- original 16-value list (i.e. everything below minus the last three).
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'application_submitted', 'application_accepted', 'application_rejected',
  'opportunity_changed', 'opportunity_cancelled', 'gig_reminder',
  'completion_confirmed', 'recommendation_received',
  'ticket_reserved', 'event_reminder', 'event_changed', 'event_cancelled',
  'checkin_success', 'points_earned', 'achievement_unlocked', 'reward_redeemed',
  'connection_request', 'connection_accepted', 'message_received'
));
