-- Menus cached by an older parser are re-read once, so fixes to the parser
-- reach orders that are already open.
ALTER TABLE "OrderSession" ADD COLUMN "menuVersion" INTEGER NOT NULL DEFAULT 0;
