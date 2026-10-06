-- A note the person paying writes for everyone ordering: "50% off, but no more
-- than AED 30 per order", a minimum order, a promo code.
ALTER TABLE "OrderSession" ADD COLUMN "conditions" TEXT;
