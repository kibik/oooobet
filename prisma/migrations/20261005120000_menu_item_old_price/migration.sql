-- Dishes a service sells at a discount keep the price they were cut from,
-- so the menu can show what the discount actually is.
ALTER TABLE "MenuItem" ADD COLUMN "oldPrice" DECIMAL(10,2);
