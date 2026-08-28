import mongoose from 'mongoose'

const itemSchema = new mongoose.Schema({
    nameEng: {type:String, required:true},
    nameNep: {type:String,required:true},
    unitEng: {type:String,required:true},
    unitNep: {type:String,required:true},
    minPrice: {type:Number,required:true},
    maxPrice: {type:Number,required:true},
    avgPrice: {type:Number,required:true},
    minPriceNep: {type:String,required:true},
    maxPriceNep: {type:String,required:true},
    avgPriceNep: {type:String,required:true},
    image:{type:String, default:"no-preview.jpg"},
    status:{type:Boolean, default:false},
    // true when the item appears in today's scraped market data
    available:{type:Boolean, default:false}
});
const itemModel=mongoose.models.item||mongoose.model("item",itemSchema);

export default itemModel;