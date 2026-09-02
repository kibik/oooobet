/**
 * Next.js server startup hook. The payment-reminder sweep must run even if no
 * Telegram update has hit /api/bot yet, so it is started here rather than as a
 * side effect of importing the bot route.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startReminderTicker } = await import("@/lib/reminders");
  startReminderTicker();
}
