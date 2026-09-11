import { KATHMANDU_COORDS } from "../models/vendorModel.js";

export const run = async (db) => {
  // one-time backfill — vendors created before locations existed would be
  // invisible to $geoNear; give them the Kathmandu default (hasSetLocation
  // stays false so they're still nudged to pick a real spot)
  const { modifiedCount } = await db
    .collection("vendors")
    .updateMany(
      { location: { $exists: false } },
      {
        $set: {
          location: { type: "Point", coordinates: KATHMANDU_COORDS },
          hasSetLocation: false,
        },
      }
    );
  if (modifiedCount > 0) {
    console.log(`Backfilled working location for ${modifiedCount} vendor(s)`);
  }
};
