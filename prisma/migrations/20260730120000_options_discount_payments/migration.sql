-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "optionsJson" JSONB;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "options" TEXT;

-- AlterTable
ALTER TABLE "OrderSession" ADD COLUMN "discountPercent" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_sessionId_userId_key" ON "Payment"("sessionId", "userId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OrderSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
