import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

// we use async and not asyncHandler because this function is not going to interact with the frontend so no need of try catch block
const generateAccessAndRefereshTokens = async (userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        // storing the token in the database for future use 
        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false }) //checks against the old instance and updates it . 
        return { accessToken, refreshToken }
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating referesh and access token")
    }
}
/* validateBeforeSave : since password was a mandatory field and we just wanted to store this without interacting with the password
 Its like saying to the db that i know what i am doing , let it happen even if other fields are true.
 user is a Mongoose document instance, not just a plain JavaScript object
*/
const registerUser = asyncHandler(async (req, res) => {
    // Get user details from frontend (supporting both fullName and fullname)
    const { fullName, fullname, email, username, password } = req.body || {};
    const userFullName = (fullName || fullname || "").toString().trim();
    const emailStr = (email || "").toString().trim();
    const usernameStr = (username || "").toString().trim();
    const passwordStr = (password || "").toString().trim();

    // Validation
    if (
        [userFullName, emailStr, usernameStr, passwordStr].some(
            (field) => field === ""
        )
    ) {
        throw new ApiError(400, "All fields are required");
    }

    // Check if user already exists
    const existedUser = await User.findOne({
        $or: [{ username: usernameStr.toLowerCase() }, { email: emailStr.toLowerCase() }]
    });

    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists");
    }

    // Get uploaded file paths
    const avatarLocalPath = req.files?.avatar?.[0]?.path;
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

    // Avatar is mandatory
    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required");
    }

    // Upload files to Cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = coverImageLocalPath
        ? await uploadOnCloudinary(coverImageLocalPath)
        : null;

    if (!avatar) {
        throw new ApiError(400, "Avatar file upload failed");
    }

    // Create user
    const user = await User.create({
        fullName: userFullName,
        avatar: avatar.url || avatar.secure_url,
        coverImage: coverImage?.url || coverImage?.secure_url || "",
        email: emailStr,
        password: passwordStr,
        username: usernameStr.toLowerCase(),
    });

    // Remove sensitive fields
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    if (!createdUser) {
        throw new ApiError(
            500,
            "Something went wrong while registering the user"
        );
    }

    // Send response
    return res.status(201).json(
        new ApiResponse(
            201,
            createdUser,
            "User registered successfully"
        )
    );
});

const loginUser = asyncHandler(async (req, res) => {
    // req body -> data
    // username or email
    //find the user
    //password check
    //access and referesh token
    //send cookie

    const { email, username, password } = req.body || {};

    if (!username && !email) {
        throw new ApiError(400, "Username or email is required");
    }

    if (!password) {
        throw new ApiError(400, "Password is required");
    }

    const user = await User.findOne({
        $or: [
            { username: username ? username.toLowerCase() : undefined },
            { email: email ? email.toLowerCase() : undefined }
        ].filter(Boolean)
    });

    if (!user) {
        throw new ApiError(404, "User does not exist");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    const options = {
        httpOnly: true,
        secure: true
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken,
                    refreshToken
                },
                "User logged In Successfully"
            )
        );
});

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1
            }
        },
        {
            new: true // so we get the updated value 
        }
    );

    const options = {
        httpOnly: true, // if true, only modifiable on server, not frontend
        secure: true   // if true, only send cookie over HTTPS
    };

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged Out"));
});

export {
    registerUser,
    loginUser,
    logoutUser
};