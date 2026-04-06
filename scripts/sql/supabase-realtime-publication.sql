-- Run in Supabase Dashboard → SQL Editor (once per project).
-- Enables Realtime INSERT events for in-app toasts (ChallengeRealtimeBridge).
-- If a line errors with "already member of publication", skip that line.

ALTER PUBLICATION supabase_realtime ADD TABLE "Challenge";
ALTER PUBLICATION supabase_realtime ADD TABLE "Participant";
