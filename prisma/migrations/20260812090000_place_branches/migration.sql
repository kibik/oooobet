-- AlterTable
ALTER TABLE "OrderSession" ADD COLUMN "placeSlug" TEXT;
ALTER TABLE "OrderSession" ADD COLUMN "placeName" TEXT;
ALTER TABLE "OrderSession" ADD COLUMN "placeAddress" TEXT;
ALTER TABLE "OrderSession" ADD COLUMN "placeOptions" JSONB;
