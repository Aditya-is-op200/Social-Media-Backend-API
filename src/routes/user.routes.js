/*
This middleware temporarily stores uploaded images on the server and makes them
available in req.files, so the controller can upload them to Cloudinary.
*/

import express, { Router } from "express";
import { registerUser } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

/*Route for user registration:*/
// The 'upload.fields' middleware is used to handle file uploads for the 'avatar' and 'coverImage' fields. 
//And notice after the 'upload.fields' middleware we are calling the 'registerUser' controller function which will handle the registration logic. The order matters .
router.route("/register").post(
    upload.fields([
        { name: "avatar", maxCount: 1 }, //name given by us "avatar" and "coverImage" should be same as the name given in the frontend.
        { name: "coverImage", maxCount: 1 },
    ]),
    registerUser);

export default router;