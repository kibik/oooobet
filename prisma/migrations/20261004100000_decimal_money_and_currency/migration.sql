-- Money becomes fixed-point: UAE prices are fractional (25.50 AED).
-- Widening INTEGER to DECIMAL preserves every existing value.
ALTER TABLE "OrderSession" ALTER COLUMN "deliveryFee" TYPE DECIMAL(10,2);
ALTER TABLE "OrderSession" ALTER COLUMN "serviceFee" TYPE DECIMAL(10,2);
ALTER TABLE "MenuItem" ALTER COLUMN "price" TYPE DECIMAL(10,2);
ALTER TABLE "OrderItem" ALTER COLUMN "price" TYPE DECIMAL(10,2);
ALTER TABLE "PaymentReminder" ALTER COLUMN "amount" TYPE DECIMAL(10,2);

-- Which currency those numbers are in
ALTER TABLE "OrderSession" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'RUB';
