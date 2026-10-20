-- CreateEnum
CREATE TYPE "BotSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'HANDED_OFF', 'DECLINED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_lead_assigned_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "bot_sessions" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "current_step" TEXT NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "status" "BotSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "context" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "bot_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bot_sessions_lead_id_key" ON "bot_sessions"("lead_id");

-- AddForeignKey
ALTER TABLE "bot_sessions" ADD CONSTRAINT "bot_sessions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
