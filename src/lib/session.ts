import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId?: string; // BigInt stored as string
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
}

const sessionOptions = {
  password:
    process.env.SESSION_SECRET || "complex-secret-at-least-32-characters-long",
  cookieName: "edashare_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
