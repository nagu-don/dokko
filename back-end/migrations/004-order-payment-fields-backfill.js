export const run = async (db) => {
  // one-time backfill — orders placed before payment fields existed
  // need paymentStatus and paymentMethod set so queries and indexes
  // work consistently across old and new records
  const { modifiedCount } = await db
    .collection("orders")
    .updateMany(
      { paymentStatus: { $exists: false } },
      {
        $set: {
          paymentStatus: "unpaid",
          paymentMethod: null,
        },
      }
    );
  if (modifiedCount > 0) {
    console.log(`Backfilled payment fields into ${modifiedCount} order(s)`);
  }
};
