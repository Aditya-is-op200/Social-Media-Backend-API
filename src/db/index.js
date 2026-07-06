import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const connectDB = async()=>{
    try {
        const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
        console.log(`\n MongoDB connected !! \n 
                    DB_HOST : ${connectionInstance.connection.host}`);
                    //It shows where it is connected -> to the testing/production/development server 
    } catch (error) {
        console.log("MongoDB connection error : " , error)
        process.exit(1);
        //this process function is present inside node , so we dont need to import it . 
        // The number written is an exit code .
    }
}

export default connectDB;