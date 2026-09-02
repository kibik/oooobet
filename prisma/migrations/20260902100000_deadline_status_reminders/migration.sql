-- AlterTable
ALTER TABLE "OrderSession" ADD COLUMN "deadlineAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "readyAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReminder" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "amount" INTEGER NOT NULL,
    "nextAt" TIMESTAMP(3) NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Participant_sessionId_userId_key" ON "Participant"("sessionId", "userId");
CREATE UNIQUE INDEX "PaymentReminder_sessionId_userId_key" ON "PaymentReminder"("sessionId", "userId");
CREATE INDEX "PaymentReminder_doneAt_nextAt_idx" ON "PaymentReminder"("doneAt", "nextAt");

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OrderSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReminder" ADD CONSTRAINT "PaymentReminder_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OrderSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReminder" ADD CONSTRAINT "PaymentReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
