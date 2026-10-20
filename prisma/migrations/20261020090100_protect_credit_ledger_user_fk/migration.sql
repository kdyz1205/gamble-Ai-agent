-- Match the existing canonical onDelete: Restrict contract. Only replace the
-- known legacy CASCADE foreign key. Validation failure restores its metadata;
-- this transaction never deletes users, ledger rows or orphaned records.
BEGIN;

DO $$
DECLARE prior RECORD;
BEGIN
  SELECT * INTO prior FROM pg_constraint
  WHERE conrelid = 'public."CreditTx"'::regclass AND conname = 'CreditTx_userId_fkey';
  IF FOUND THEN
    IF prior.contype <> 'f' OR prior.confrelid <> 'public."User"'::regclass
      OR prior.conkey <> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public."CreditTx"'::regclass AND attname = 'userId')]
      OR prior.confkey <> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public."User"'::regclass AND attname = 'id')]
      OR prior.confupdtype <> 'c' OR prior.confdeltype NOT IN ('c', 'r') THEN
      RAISE EXCEPTION 'Unexpected CreditTx_userId_fkey definition; reconciliation is required';
    END IF;
    IF prior.confdeltype = 'r' THEN RETURN; END IF;
    ALTER TABLE "CreditTx" DROP CONSTRAINT "CreditTx_userId_fkey";
  END IF;
  ALTER TABLE "CreditTx" ADD CONSTRAINT "CreditTx_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
END $$;

ALTER TABLE "CreditTx" VALIDATE CONSTRAINT "CreditTx_userId_fkey";
COMMIT;
