/*
This middleware temporarily stores uploaded images on the server and makes them
available in req.files, so the controller can upload them to Cloudinary.
*/

import express, { Router } from "express";
import { registerUser, loginUser, logoutUser, refreshAccessToken } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

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
router.route("/login").post(loginUser)

//secured routes
router.route("/logout").post(verifyJWT, logoutUser)
router.route("/refresh-token").post(refreshAccessToken)
export default router;