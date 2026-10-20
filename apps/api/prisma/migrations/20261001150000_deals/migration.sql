-- CreateEnum
CREATE TYPE "DealKind" AS ENUM ('SALE', 'RENT');

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "broker_id" UUID,
ADD COLUMN     "kind" "DealKind" NOT NULL DEFAULT 'SALE',
ADD COLUMN     "property_reference" TEXT,
ADD COLUMN     "voided_at" TIMESTAMPTZ(3),
ADD COLUMN     "voided_by_id" UUID;

-- CreateIndex
CREATE INDEX "deals_broker_id_closed_at_idx" ON "deals"("broker_id", "closed_at");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indicadores leem leads por data de chegada
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");
