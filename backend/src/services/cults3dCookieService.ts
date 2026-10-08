import { prisma } from "../db";

/** Per-user, unlike the instance-wide API key pair: Cults3D file downloads run as the user's own
 *  login, because the API deliberately exposes no file URLs for other people's designs. */
export async function getUserCults3dCookie(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { cults3dCookie: true } });
  return user?.cults3dCookie ?? null;
}

export async function setUserCults3dCookie(userId: string, cookie: string | null): Promise<boolean> {
  const trimmed = (cookie ?? "").trim();
  await prisma.user.update({ where: { id: userId }, data: { cults3dCookie: trimmed || null } });
  return Boolean(trimmed);
}
