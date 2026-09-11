export const run = async (db) => {
  // one-time backfill — orders placed before priority search existed
  // All pre-existing orders are treated as already assigned (legacy):
  //   - set priorityStage = "ASSIGNED"
  //   - set priorityStartedAt = createdAt (when the order was placed)
  //   - keep existing deliveryCharge untouched (already has a value)
  const { modifiedCount } = await db
    .collection("orders")
    .updateMany(
      { priorityStage: { $exists: false } },
      [
        {
          $set: {
            priorityStage: "ASSIGNED",
            priorityStartedAt: "$createdAt",
            priorityExpiresAt: null,
          },
        },
      ]
    );
  if (modifiedCount > 0) {
    console.log(`Backfilled priority search fields into ${modifiedCount} order(s)`);
  }
};
