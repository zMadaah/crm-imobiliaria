-- CreateEnum
CREATE TYPE "VisitSource" AS ENUM ('BOT', 'PANEL');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'VISIT_BOOKED';

-- AlterTable (ends_at preenchido para visitas antigas com 1 hora de duração)
ALTER TABLE "visits" ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "ends_at" TIMESTAMPTZ(3),
ADD COLUMN     "outcome_at" TIMESTAMPTZ(3),
ADD COLUMN     "rescheduled_from_id" UUID,
ADD COLUMN     "source" "VisitSource" NOT NULL DEFAULT 'PANEL';

UPDATE "visits" SET "ends_at" = "scheduled_at" + INTERVAL '1 hour' WHERE "ends_at" IS NULL;
ALTER TABLE "visits" ALTER COLUMN "ends_at" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "visits_rescheduled_from_id_key" ON "visits"("rescheduled_from_id");

-- CreateIndex
CREATE INDEX "visits_status_ends_at_idx" ON "visits"("status", "ends_at");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_rescheduled_from_id_fkey" FOREIGN KEY ("rescheduled_from_id") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Travas extras (o Prisma não gera estas; a regra também existe no backend)
-- ---------------------------------------------------------------------------

ALTER TABLE "visits" ADD CONSTRAINT "visits_ends_after_start_check" CHECK ("ends_at" > "scheduled_at");

-- Um corretor não pode ter duas visitas marcadas ou realizadas no mesmo horário.
-- Intervalo [início, fim): uma visita das 14h às 15h não bate com outra das 15h às 16h.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "visits" ADD CONSTRAINT "visits_no_overlap"
  EXCLUDE USING gist ("broker_id" WITH =, tstzrange("scheduled_at", "ends_at", '[)') WITH &&)
  WHERE ("status" IN ('SCHEDULED', 'DONE'));
