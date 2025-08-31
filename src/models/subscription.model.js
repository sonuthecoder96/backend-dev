import { Schema } from "mongoose";
import mongoose  from "mongoose";


const subscriptionSchema = new Schema({
  subscriber: {
    type: Schema.Types.ObjectId, //one eho is subscribing
    ref: "User",
  },
  channel: {
    type: Schema.Types.ObjectId, //one whom is subscriber subscribing
    ref: "User",
  },
},{timestamps:true});



export const Subscription = mongoose.model("Subscription", subscriptionSchema); 