import mongoose from 'mongoose'

const ADMIN_STATUSES = ["pending", "active", "rejected"];

const adminSchema = new mongoose.Schema({
    name: {type:String, required:true},
    email: {type:String, required:true, unique:true, lowercase:true, trim:true},
    phone: {type:String, required:true, unique:true, match:/^\d{10}$/},
    password:{type:String, required:true},
    status: {type: String, enum: ADMIN_STATUSES, default: "pending"},
    approvedByAdminId: {type: mongoose.Schema.Types.ObjectId, ref: "admin", default: null},
    approvedAt: {type: Date, default: null},
    adminNote: {type: String, default: null, trim: true},
    // finance permission — gates settlement approve/pay actions
    canManageFinance: {type: Boolean, default: false}
});

const adminModel = mongoose.models.admin || mongoose.model("admin", adminSchema);

export default adminModel;
export {ADMIN_STATUSES};
