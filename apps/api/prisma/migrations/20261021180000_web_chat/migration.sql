-- CreateEnum
CREATE TYPE "LeadChannel" AS ENUM ('WHATSAPP', 'SITE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'LEAD_RETURNED';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "channel" "LeadChannel" NOT NULL DEFAULT 'WHATSAPP';

-- CreateTable
CREATE TABLE "web_chats" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ad_code" TEXT,
    "state" JSONB NOT NULL,
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "pending_answers" JSONB NOT NULL DEFAULT '[]',
    "status" "BotSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lead_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "web_chats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "web_chats_token_hash_key" ON "web_chats"("token_hash");

-- CreateIndex
CREATE INDEX "web_chats_lead_id_idx" ON "web_chats"("lead_id");

-- AddForeignKey
ALTER TABLE "web_chats" ADD CONSTRAINT "web_chats_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
