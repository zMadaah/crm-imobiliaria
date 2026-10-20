-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "last_inbound_at" TIMESTAMPTZ(3),
ADD COLUMN     "last_message_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "lead_reads" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "last_read_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lead_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_reads_user_id_lead_id_key" ON "lead_reads"("user_id", "lead_id");

-- CreateIndex
CREATE INDEX "leads_last_message_at_idx" ON "leads"("last_message_at" DESC);

-- AddForeignKey
ALTER TABLE "lead_reads" ADD CONSTRAINT "lead_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_reads" ADD CONSTRAINT "lead_reads_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preenche as datas dos leads que já existem
UPDATE "leads" l SET
  "last_message_at" = (SELECT MAX(m."sent_at") FROM "messages" m WHERE m."lead_id" = l."id"),
  "last_inbound_at" = (SELECT MAX(m."sent_at") FROM "messages" m WHERE m."lead_id" = l."id" AND m."direction" = 'INBOUND');
