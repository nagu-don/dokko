import mongoose from "mongoose"

// Kathmandu, Nepal — default working location until the vendor picks one on the map
const KATHMANDU_COORDS = [85.324, 27.7172]; // [lng, lat]

const vendorSchema = new mongoose.Schema({
    name: {type:String, required:true},
    email: {type:String, required:true, unique:true, lowercase:true, trim:true},
    phone: {type:String, required:true, unique:true, match:/^\d{10}$/},
    // true when `phone` is a Google-sign-in placeholder, not a real number yet
    phoneIsPlaceholder: {type:Boolean, default:false},
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

    // ── LIVE location — for order tracking ────────────────────────────
    // This is explicitly SEPARATE from the static `location` (working shop
    // location used for geo-matching). It holds the vendor's latest reported
    // GPS position + when it was received, and is only surfaced to a customer
    // while the assigned order is still Processing (see the vendor
    // live-location endpoint + customer read in the controllers). Null while
    // the vendor is not actively tracking an order.
    liveLocation: {
        type: {type: String, enum: ["Point"], default: "Point"},
        coordinates: {type: [Number], default: undefined},
        updatedAt: {type: Date, default: null},
    },

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
