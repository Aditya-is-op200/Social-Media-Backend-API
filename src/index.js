import dotenv from "dotenv";
import connectDB from "./db/index.js";
import app from "./app.js";

dotenv.config({
    path: "./.env",
});

connectDB()
    .then(() => {

        // Listen for error events on the Express app
        app.on("error", (error) => {
            console.log("ERROR:", error);
            throw error;
        });

        app.listen(process.env.PORT || 8000, () => {
            console.log(
                `Server is running at port ${process.env.PORT || 8000}`
            );
        });

    })
    .catch((err) => {
        console.log("MONGODB connection failed !!!", err);
    });
// Alternative way to connect to the database and start the server
/**
 const startServer = async () => {
    try {
        await connectDB();

        app.listen(process.env.PORT || 8000, () => {
            console.log(`Server is running at port ${process.env.PORT || 8000}`);
        });

    } catch (error) {
        console.log("MONGODB connection failed !!!", error);
    }
};

startServer();
 */


//Method 2 :

/*
import express from "express"
const app = express()
( async () => {
    try {
        await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
        app.on("errror", (error) => {
            console.log("ERRR: ", error);
            throw error
        })

        app.listen(process.env.PORT, () => {
            console.log(`App is listening on port ${process.env.PORT}`);
        })

    } catch (error) {
        console.error("ERROR: ", error)
        throw err
    }
})()

*/