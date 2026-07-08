import { v2 as Adityacloudinary } from "cloudinary";
import fs from "fs";

Adityacloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localfilePath) => {
    try {
        if(!localfilePath) throw new Error("Local file path is required");
        //upload the file to cloudinary
        const response = await Adityacloudinary.uploader.upload(localfilePath , {
            resource_type : "auto", //it will automatically detect the type of file and upload it accordingly. It can be image, video, pdf, etc.
        })
        //file successfully uploaded on cloudinary 
        console.log("File successfully uploaded on cloudinary" , response.url);
        return response;
    }
    catch (error) {
        fs.unlinkSync(localfilePath); //delete the file from local storage if there is an error while uploading on cloudinary
        console.log("Error while uploading on cloudinary : ", error);
        return null;
    }
}

export default uploadOnCloudinary;