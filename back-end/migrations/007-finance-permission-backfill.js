const PRIME_ADMIN_EMAIL = "prime@admin";

export const run = async (db) => {
  // one-time backfill — admins created before finance permissions existed:
  // explicitly grant the finance permission to the prime admin only
  // (targeted, never a silent mass-grant). Guarantees at least one
  // finance-capable admin exists so settlement payouts stay possible.
  const { modifiedCount } = await db
    .collection("admins")
    .updateOne(
      { email: PRIME_ADMIN_EMAIL, canManageFinance: { $exists: false } },
      { $set: { canManageFinance: true } }
    );
  if (modifiedCount > 0) {
    console.log(`Granted finance permission to prime admin (${PRIME_ADMIN_EMAIL})`);
  }
};
