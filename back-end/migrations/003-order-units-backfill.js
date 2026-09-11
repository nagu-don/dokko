export const run = async (db) => {
  // one-time backfill — orders placed before unit snapshots carried an
  // item's real unit would show as kg in vendor apps; copy unitEng/unitNep
  // over from the items collection by matching nameEng
  const unitDocs = await db
    .collection("items")
    .find({}, { projection: { nameEng: 1, unitEng: 1, unitNep: 1 } })
    .toArray();
  const unitByEng = new Map(
    unitDocs.filter((i) => i.unitEng).map((i) => [i.nameEng, i])
  );

  if (unitByEng.size > 0) {
    const staleUnits = await db
      .collection("orders")
      .find({
        $or: [
          { "items.unitEng": { $in: [null, ""] } },
          { "items.unitEng": { $exists: false } },
        ],
      })
      .toArray();

    let fixedUnits = 0;
    for (const order of staleUnits) {
      const items = (order.items || []).map((row) => {
        const src = unitByEng.get(row.nameEng);
        if (!src) return row;
        return {
          ...row,
          unitEng: row.unitEng || src.unitEng || "",
          unitNep: row.unitNep || src.unitNep || "",
        };
      });
      await db
        .collection("orders")
        .updateOne({ _id: order._id }, { $set: { items } });
      fixedUnits += 1;
    }
    if (fixedUnits > 0) {
      console.log(`Backfilled units into ${fixedUnits} order(s)`);
    }
  }
};
