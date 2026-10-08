-- AlterTable
-- Per-user, unlike the instance-wide API key: file downloads need the user's own logged-in session.
ALTER TABLE "User" ADD COLUMN "cults3dCookie" TEXT;
