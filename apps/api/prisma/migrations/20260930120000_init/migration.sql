-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'BROKER');

-- CreateEnum
CREATE TYPE "LeadTemperature" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'QUALIFIED', 'IN_SERVICE', 'VISIT_SCHEDULED', 'VISIT_DONE', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "OriginSource" AS ENUM ('REF_CODE', 'CTWA_AD', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('SCHEDULED', 'DONE', 'NO_SHOW', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "DealResult" AS ENUM ('WON', 'LOST');

-- CreateEnum
CREATE TYPE "LossReason" AS ENUM ('PRICE', 'FINANCING_DENIED', 'BOUGHT_ELSEWHERE', 'GAVE_UP', 'NO_RESPONSE', 'OTHER');

-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "origin_post" TEXT,
    "origin_source" "OriginSource" NOT NULL DEFAULT 'UNKNOWN',
    "score" INTEGER NOT NULL DEFAULT 0,
    "temperature" "LeadTemperature",
    "broker_id" UUID,
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_stage_history" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "from_stage" "LeadStage",
    "to_stage" "LeadStage" NOT NULL,
    "changed_by_id" UUID,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "type" TEXT NOT NULL,
    "body" TEXT,
    "media_id" TEXT,
    "media_url" TEXT,
    "wa_message_id" TEXT,
    "sent_by_id" UUID,
    "sent_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualification_answers" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "question_key" TEXT NOT NULL,
    "answer_key" TEXT NOT NULL,
    "answer_label" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "qualification_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
    "property_reference" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'SCHEDULED',
    "feedback" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "result" "DealResult" NOT NULL,
    "value" DECIMAL(14,2),
    "loss_reason" "LossReason",
    "notes" TEXT,
    "closed_by_id" UUID,
    "closed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "leads_phone_key" ON "leads"("phone");

-- CreateIndex
CREATE INDEX "leads_broker_id_idx" ON "leads"("broker_id");

-- CreateIndex
CREATE INDEX "leads_stage_idx" ON "leads"("stage");

-- CreateIndex
CREATE INDEX "leads_temperature_idx" ON "leads"("temperature");

-- CreateIndex
CREATE INDEX "leads_origin_source_origin_post_idx" ON "leads"("origin_source", "origin_post");

-- CreateIndex
CREATE INDEX "lead_stage_history_lead_id_changed_at_idx" ON "lead_stage_history"("lead_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_wa_message_id_key" ON "messages"("wa_message_id");

-- CreateIndex
CREATE INDEX "messages_lead_id_sent_at_idx" ON "messages"("lead_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "qualification_answers_lead_id_question_key_key" ON "qualification_answers"("lead_id", "question_key");

-- CreateIndex
CREATE INDEX "visits_broker_id_scheduled_at_idx" ON "visits"("broker_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "visits_lead_id_idx" ON "visits"("lead_id");

-- CreateIndex
CREATE INDEX "deals_lead_id_idx" ON "deals"("lead_id");

-- CreateIndex
CREATE INDEX "deals_result_closed_at_idx" ON "deals"("result", "closed_at");

-- CreateIndex
CREATE INDEX "webhook_events_status_received_at_idx" ON "webhook_events"("status", "received_at");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_stage_history" ADD CONSTRAINT "lead_stage_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_stage_history" ADD CONSTRAINT "lead_stage_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualification_answers" ADD CONSTRAINT "qualification_answers_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Travas extras (o Prisma não gera CHECK; a regra também existe no backend)
-- ---------------------------------------------------------------------------

-- Telefone só com dígitos, formato internacional
ALTER TABLE "leads" ADD CONSTRAINT "leads_phone_digits_check" CHECK ("phone" ~ '^[0-9]{8,15}$');

-- Score nunca negativo
ALTER TABLE "leads" ADD CONSTRAINT "leads_score_non_negative_check" CHECK ("score" >= 0);

-- Venda exige valor maior que zero
ALTER TABLE "deals" ADD CONSTRAINT "deals_won_requires_value_check" CHECK ("result" <> 'WON' OR ("value" IS NOT NULL AND "value" > 0));

-- Perda exige motivo
ALTER TABLE "deals" ADD CONSTRAINT "deals_lost_requires_reason_check" CHECK ("result" <> 'LOST' OR "loss_reason" IS NOT NULL);
