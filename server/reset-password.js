import { findUserByEmail, invalidateSessionsForUser, setCredential } from "./auth.js";

/**
 * Password recovery when nobody left with a working login can reset it for you —
 * most importantly, a General Manager locked out with no other GM account to ask.
 * There's no email server in this reference stack (see README "Next steps"), so
 * this is the standard fallback for a self-hosted app without one: whoever has
 * terminal access to wherever this server actually runs can reset any account
 * directly against the database, no login required. Run it on the same machine/
 * environment as the server (it opens the same SQLite file via db.js).
 *
 * Usage:
 *   node reset-password.js <email> <newPassword>
 */
const [, , email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.error("Usage: node reset-password.js <email> <newPassword>");
  process.exit(1);
}
if (newPassword.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const user = findUserByEmail(email);
if (!user) {
  console.error(`No active user found with email "${email}".`);
  process.exit(1);
}

setCredential(user.id, newPassword);
invalidateSessionsForUser(user.id); // force a fresh login everywhere — an old session shouldn't outlive "I forgot my password"

console.log(`Password reset for ${user.name} <${user.email}> (${user.role}). Every existing session for this account has been signed out.`);
