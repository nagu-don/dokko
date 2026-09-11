export const run = async (db) => {
  // one-time backfill — vendors created before payout fields existed
  const { modifiedCount } = await db
    .collection("vendors")
    .updateMany(
      { payoutMethod: { $exists: false } },
      {
        $set: {
          payoutMethod: null,
          payoutBankName: null,
          payoutAccountNumber: null,
          payoutAccountHolder: null,
        },
      }
    );
  if (modifiedCount > 0) {
    console.log(`Backfilled payout fields into ${modifiedCount} vendor(s)`);
  }
};
