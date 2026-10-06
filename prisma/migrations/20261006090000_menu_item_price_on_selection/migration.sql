-- Dishes assembled from options (a build-your-own wok, a curry with a choice of
-- protein) carry no price until the options are picked.
ALTER TABLE "MenuItem" ADD COLUMN "priceOnSelection" BOOLEAN NOT NULL DEFAULT false;
