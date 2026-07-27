import { asyncHandler } from "../utils/asyncHandler.js";

const registerUser = asyncHandler(async (req, res) => {
    // Your registration logic here
    // res.status(201).json({ message: "User registered successfully" });
    //removing the above line , now writing the logic for registering the user in the database


    //s1 :If the data is coming from the form or directly from json then we can get the data from the req.body object.
    //However for url we have to do it differently , we have to get the data from the req.query object.

    const { username, email, fullname, password } = req.body;
    // Validate required fields on Postman , go to body and select raw and then select json and then send the request with the required fields in the json format.


    //s1(b) : The above doesnt handle files like avatar and coverImage , so we have to handle them separately. We can use multer for that. We will create a middleware for that and then use it in the route.
    // Process to do Step s1(b) : Goto src/middlewares/multer.middleware.js and write the code for handling the files. Then we will use that middleware in the route. 
    // s1(b) : Now we will use the multer middleware in the route. Goto src/routes/user.routes.js and import the multer middleware that is 'upload' and then use it in the route. Then we will get the files from the req.files object in the controller.
});

export default registerUser;

 /**
    ALgorithm for registering the user in the database:
        S1:Get user details from frontend
        S2:Validate all required fields (not empty)
        S3:Check if user already exists (username/email)
        S4:Check uploaded files (avatar required, coverImage optional)
        S5:Upload images to Cloudinary
        S6:Create user object and save it in the database
        S7:Fetch created user without password and refreshToken
        S8:Verify user creation was successful, else throw error
        S9:Return success response
    */