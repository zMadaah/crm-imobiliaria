-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "origin_ad_id" TEXT,
ADD COLUMN     "origin_ref" TEXT;

-- CreateTable
CREATE TABLE "ads" (
    "id" UUID NOT NULL,
    "ad_id" TEXT NOT NULL,
    "headline" TEXT,
    "name" TEXT,
    "property_reference" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ads_ad_id_key" ON "ads"("ad_id");

-- CreateIndex
CREATE INDEX "leads_origin_ad_id_idx" ON "leads"("origin_ad_id");

-- Leads que já vieram de anúncio: separa o ID e cria o anúncio com o título recebido.
-- Formato antigo de origin_post: "AD-<id>" ou "AD-<id> (<título>)".
UPDATE "leads"
SET "origin_ad_id" = substring("origin_post" from '^AD-([^ ]+)')
WHERE "origin_source" = 'CTWA_AD' AND "origin_post" ~ '^AD-[^ ]+';

UPDATE "leads"
SET "origin_ref" = "origin_post"
WHERE "origin_source" = 'REF_CODE';

INSERT INTO "ads" ("id", "ad_id", "headline", "updated_at")
SELECT gen_random_uuid(), l."origin_ad_id", MAX(substring(l."origin_post" from '^AD-[^ ]+ \((.*)\)$')), now()
FROM "leads" l
WHERE l."origin_ad_id" IS NOT NULL
GROUP BY l."origin_ad_id";

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_origin_ad_id_fkey" FOREIGN KEY ("origin_ad_id") REFERENCES "ads"("ad_id") ON DELETE SET NULL ON UPDATE CASCADE;
