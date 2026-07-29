import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

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

export { registerUser };