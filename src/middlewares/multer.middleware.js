// Multer middleware is used to save files temporarily on the server


import multer from "multer";
import path from "path";


const storage = multer.diskStorage({
    destination: function (req, file, cb) { // this is a callback function which we have defined here.
        cb(null, "./public/temp"); // to store temporary files in this folder
    },

    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);

        cb(
            null,
            path.parse(file.originalname).name +
            "-" +
            uniqueSuffix +
            path.extname(file.originalname)
        );
    }
});

export const upload = multer({ storage });