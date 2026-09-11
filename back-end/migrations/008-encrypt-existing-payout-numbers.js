import { encryptField } from "../utils/fieldEncryption.js";

// Skip values that already look encrypted (iv:authTag:ciphertext — two colons).
function isPlaintext(value) {
  return typeof value === "string" && value.length > 0 && (value.match(/:/g) || []).length < 2;
}

export const run = async (db) => {
  const vendors = db.collection("vendors");
  const settlements = db.collection("settlements");

  const cursor = vendors.find({ payoutAccountNumber: { $type: "string", $ne: "" } });
  let vendorCount = 0;
  for await (const doc of cursor) {
    if (isPlaintext(doc.payoutAccountNumber)) {
      const encrypted = encryptField(doc.payoutAccountNumber);
      await vendors.updateOne(
        { _id: doc._id, payoutAccountNumber: doc.payoutAccountNumber },
        { $set: { payoutAccountNumber: encrypted } }
      );
      vendorCount++;
    }
  }
  if (vendorCount > 0) {
    console.log(`Encrypted payout account numbers for ${vendorCount} vendor(s)`);
  }

  const sCursor = settlements.find({ "payoutDestination.accountNumber": { $type: "string", $ne: "" } });
  let settlementCount = 0;
  for await (const doc of sCursor) {
    const accountNumber = doc.payoutDestination?.accountNumber;
    if (isPlaintext(accountNumber)) {
      const encrypted = encryptField(accountNumber);
      await settlements.updateOne(
        { _id: doc._id },
        { $set: { "payoutDestination.accountNumber": encrypted } }
      );
      settlementCount++;
    }
  }
  if (settlementCount > 0) {
    console.log(`Encrypted payout account numbers in ${settlementCount} settlement(s)`);
  }
};