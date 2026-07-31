import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
// the paginate plugin will help us to paginate the videos and fetch them in chunks

const videoSchema = new Schema({
    videoFile: {
        type: String, //cloudinary url of the video which is uploaded by the user 
        required: [true, "Video file is required"],
        trim : true,
    },
    thumbnail : {
        type : String, //cludinary url uploaded by the user.
        required : [true, "Thumbnail is required"],
        trim : true,
    },
    title : {
        type : String,
        required : [true, "Title is required"],
        trim : true,
        minLength : [3, "Title must be at least 3 characters long"],
        maxLength : [100, "Title must be at most 100 characters long"],
    },
    description : {
        type : String,
        required : [true, "Description is required"],
        trim: true,
        minLength : [3, "Description must be at least 3 characters long"],
        maxLength : [500, "Description must be at most 500 characters long"],
    },
    duration : {
        type : Number, //duration of the video in seconds from cloudinary response after uploading the video to cloudinary.   
        required : [true, "Duration is required"],
    },
    views : {
        type : Number,
        default : 0,
    },
    ispublished : {
        type : Boolean,
        default : true,
    },
    owner : {
        type : mongoose.Schema.Types.ObjectId,
        ref : "User",
        required : [true, "Owner is required"],
    },
},{
    timestamps : true,
})

videoSchema.plugin(mongooseAggregatePaginate);

export const Video = mongoose.model("Video", videoSchema);

export default Video;
