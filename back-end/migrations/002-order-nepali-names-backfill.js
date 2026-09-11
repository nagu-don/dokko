export const run = async (db) => {
  // one-time backfill — orders placed before item snapshots carried Nepali
  // names would fall back to English in the vendor app; copy them over
  // from the items collection by matching nameEng
  const itemDocs = await db
    .collection("items")
    .find({}, { projection: { nameEng: 1, nameNep: 1 } })
    .toArray();
  const nepByName = new Map(
    itemDocs.filter((i) => i.nameNep).map((i) => [i.nameEng, i.nameNep])
  );

  if (nepByName.size > 0) {
    const stale = await db
      .collection("orders")
      .find({ "items.nameNep": { $in: [null, ""] } })
      .toArray();

    let fixedOrders = 0;
    for (const order of stale) {
      const items = (order.items || []).map((row) => ({
        ...row,
        nameNep: row.nameNep || nepByName.get(row.nameEng) || "",
      }));
      await db
        .collection("orders")
        .updateOne({ _id: order._id }, { $set: { items } });
      fixedOrders += 1;
    }
    if (fixedOrders > 0) {
      console.log(`Backfilled Nepali item names into ${fixedOrders} order(s)`);
    }
  }
};
