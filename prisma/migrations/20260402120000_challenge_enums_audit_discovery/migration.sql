-- Challenge / Participant enums + discovery snapshot + AuditLog

CREATE TYPE "ChallengeStatus" AS ENUM (
  'draft',
  'open',
  'matched',
  'live',
  'judging',
  'settled',
  'cancelled',
  'disputed'
);

CREATE TYPE "ParticipantRole" AS ENUM ('creator', 'opponent', 'spectator');

CREATE TYPE "ParticipantStatus" AS ENUM ('pending', 'accepted', 'declined', 'completed');

ALTER TABLE "Challenge" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Challenge" ALTER COLUMN "status" TYPE "ChallengeStatus" USING (
  CASE TRIM("status")
    WHEN 'draft' THEN 'draft'::"ChallengeStatus"
    WHEN 'open' THEN 'open'::"ChallengeStatus"
    WHEN 'matched' THEN 'matched'::"ChallengeStatus"
    WHEN 'live' THEN 'live'::"ChallengeStatus"
    WHEN 'judging' THEN 'judging'::"ChallengeStatus"
    WHEN 'settled' THEN 'settled'::"ChallengeStatus"
    WHEN 'cancelled' THEN 'cancelled'::"ChallengeStatus"
    WHEN 'disputed' THEN 'disputed'::"ChallengeStatus"
    ELSE 'open'::"ChallengeStatus"
  END
);

ALTER TABLE "Challenge" ALTER COLUMN "status" SET DEFAULT 'open'::"ChallengeStatus";

ALTER TABLE "Challenge" ADD COLUMN "discoveryLat" DOUBLE PRECISION;
ALTER TABLE "Challenge" ADD COLUMN "discoveryLng" DOUBLE PRECISION;
ALTER TABLE "Challenge" ADD COLUMN "discoveryCapturedAt" TIMESTAMP(3);

ALTER TABLE "Participant" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "Participant" ALTER COLUMN "role" TYPE "ParticipantRole" USING (
  CASE TRIM("role")
    WHEN 'creator' THEN 'creator'::"ParticipantRole"
    WHEN 'opponent' THEN 'opponent'::"ParticipantRole"
    WHEN 'spectator' THEN 'spectator'::"ParticipantRole"
    ELSE 'opponent'::"ParticipantRole"
  END
);

ALTER TABLE "Participant" ALTER COLUMN "role" SET DEFAULT 'opponent'::"ParticipantRole";

ALTER TABLE "Participant" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Participant" ALTER COLUMN "status" TYPE "ParticipantStatus" USING (
  CASE TRIM("status")
    WHEN 'pending' THEN 'pending'::"ParticipantStatus"
    WHEN 'accepted' THEN 'accepted'::"ParticipantStatus"
    WHEN 'declined' THEN 'declined'::"ParticipantStatus"
    WHEN 'completed' THEN 'completed'::"ParticipantStatus"
    ELSE 'pending'::"ParticipantStatus"
  END
);

ALTER TABLE "Participant" ALTER COLUMN "status" SET DEFAULT 'pending'::"ParticipantStatus";

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "targetUserId" TEXT,
    "challengeId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_challengeId_idx" ON "AuditLog"("challengeId");
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
