import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
    name: {type:String, required:true},
    email: {type:String, required:true, unique:true, lowercase:true, trim:true},
    phone: {type:String, required:true, unique:true, match:/^\d{10}$/},
    password:{type:String, required:true}
});

const userModel = mongoose.models.user || mongoose.model("user", userSchema);

export default userModel;
