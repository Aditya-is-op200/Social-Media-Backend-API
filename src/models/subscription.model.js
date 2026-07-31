import mongoose, { Schema } from "mongoose"

const subsciptionSchema = new Schema({
    subscriber: {
        type: Schema.Types.ObjectId, // one who is subscribing
        ref: "User"
    },
    channel: {
        type: Schema.Types.ObjectId, // one to whom 'subscriber' is subscribing
        ref: "User"
    }
}, { timestamps: true })



const subscriptionSchema = subsciptionSchema;
export const Subscription = mongoose.model("Subscription", subscriptionSchema);
export const Subsciption = Subscription;