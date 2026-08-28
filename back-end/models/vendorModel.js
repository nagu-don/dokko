import mongoose from "mongoose"

// Kathmandu, Nepal — default working location until the vendor picks one on the map
const KATHMANDU_COORDS = [85.324, 27.7172]; // [lng, lat]

const vendorSchema = new mongoose.Schema({
    name: {type:String, required:true},
    email: {type:String, required:true, unique:true, lowercase:true, trim:true},
    phone: {type:String, required:true, unique:true, match:/^\d{10}$/},
    password:{type:String, required:true},
    // GeoJSON Point — where the vendor works; used to prefer the closest vendor
    location: {
        type: {
            type: String,
            enum: ["Point"],
            default: "Point"
        },
        coordinates: {type:[Number], default: KATHMANDU_COORDS}
    },
    hasSetLocation: {type:Boolean, default:false},
    isAvailable: {type:Boolean, default:true},

    // ── payout destination — for admin settlement ──────────────
    // live values; snapshotted into settlement records at creation
    payoutMethod: {type: String, enum: ["bank", null], default: null},
    payoutBankName: {type: String, default: null, trim: true},
    payoutAccountNumber: {type: String, default: null, trim: true},
    payoutAccountHolder: {type: String, default: null, trim: true},

    // ── items needed page — items hidden by the vendor ─────────
    hiddenItems: {type: [String], default: []}
});

vendorSchema.index({location: "2dsphere"});

const vendorModel = mongoose.models.vendor || mongoose.model("vendor", vendorSchema);

export default vendorModel;
export {KATHMANDU_COORDS};
