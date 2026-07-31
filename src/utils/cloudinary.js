import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localfilePath) => {
    try {
        if (!localfilePath) throw new Error("Local file path is required");

        //upload the file to cloudinary
        const response = await cloudinary.uploader.upload(localfilePath, {
            resource_type: "auto", //it will automatically detect the type of file and upload it accordingly. It can be image, video, pdf, etc.
            folder: "social-media-backend",
        });

        //file successfully uploaded on cloudinary
        fs.unlinkSync(localfilePath);
        console.log("File successfully uploaded on cloudinary", response.secure_url);
        return response;
    } catch (error) {
        if (fs.existsSync(localfilePath)) {
            fs.unlinkSync(localfilePath); //delete the file from local storage if there is an error while uploading on cloudinary
        }
        console.log("Error while uploading on cloudinary : ", error);
        return null;
    }
};

const deleteFromCloudinary = async (cloudinaryUrl) => {
    try {
        if (!cloudinaryUrl) return null;

        // Extract public_id from the URL
        // URL format: https://res.cloudinary.com/<cloud_name>/image/upload/v<version>/<folder>/<public_id>.<ext>
        const urlParts = cloudinaryUrl.split("/");
        const fileWithExt = urlParts[urlParts.length - 1];          // e.g. "abc123.jpg"
        const fileName = fileWithExt.split(".")[0];                  // e.g. "abc123"
        const folderIndex = urlParts.indexOf("upload") + 2;         // skip version segment
        const folder = urlParts.slice(folderIndex, urlParts.length - 1).join("/"); // e.g. "social-media-backend"
        const publicId = folder ? `${folder}/${fileName}` : fileName;

        const result = await cloudinary.uploader.destroy(publicId);
        console.log("Deleted from cloudinary:", publicId, result);
        return result;
    } catch (error) {
        console.log("Error while deleting from cloudinary:", error);
        return null;
    }
};

export { uploadOnCloudinary, deleteFromCloudinary };
export default uploadOnCloudinary;