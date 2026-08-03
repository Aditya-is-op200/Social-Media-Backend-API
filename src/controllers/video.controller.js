import mongoose, { isValidObjectId } from "mongoose"
import { Video } from "../models/video.model.js"
import { User } from "../models/user.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js"

/* =============================================================================
   VIDEO CONTROLLER - DETAILED TUTORIAL & IMPLEMENTATION GUIDE
   
   This controller manages video resources in a YouTube-like backend application:
   1. publishAVideo     -> Handles file uploads (video + thumbnail), metadata, and DB insertion.
   2. getAllVideos      -> Handles complex filtering, searching, sorting, lookup & pagination.
   3. getVideoById      -> Fetches single video, updates views count, populates owner & watch history.
   4. updateVideo       -> Edits metadata and updates thumbnail image with Cloudinary cleanup.
   5. deleteVideo       -> Removes MongoDB record and deletes files from Cloudinary storage.
   6. togglePublishStatus -> Toggles public visibility flag (ispublished).
   ============================================================================= */

// ─────────────────────────────────────────────────────────────
// 1. PUBLISH A VIDEO
//    Route : POST /api/v1/videos/
//    Body  : title (String), description (String)
//    Files : videoFile (File), thumbnail (File) -> via multer fields middleware
//    Auth  : Required (req.user is set by verifyJWT middleware)
// ─────────────────────────────────────────────────────────────
const publishAVideo = asyncHandler(async (req, res) => {
    // 1. Extract text inputs from request body
    const { title, description } = req.body

    // Validation: Ensure title and description are present and not just empty spaces ("   ")
    // .trim() removes leading and trailing whitespaces. Optional chaining ?. handles undefined req.body.
    if (!title?.trim() || !description?.trim()) {
        throw new ApiError(400, "Title and description are required")
    }

    // 2. Extract uploaded file local paths from Multer middleware output
    // Note: Because route uses upload.fields([{name: 'videoFile'}, {name: 'thumbnail'}]),
    // Multer attaches files under `req.files` object where each field name holds an array of file objects.
    const videoFileLocalPath = req.files?.videoFile?.[0]?.path
    const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path

    // Validate that both files were uploaded to local server temp folder
    if (!videoFileLocalPath) {
        throw new ApiError(400, "Video file is required")
    }
    if (!thumbnailLocalPath) {
        throw new ApiError(400, "Thumbnail is required")
    }

    // 3. Upload local files to Cloudinary remote storage
    // uploadOnCloudinary uploads the local temp file and automatically deletes the local temp file afterward.
    const videoFile = await uploadOnCloudinary(videoFileLocalPath)
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)

    // Handle Cloudinary upload failures
    if (!videoFile) {
        throw new ApiError(500, "Failed to upload video to Cloudinary")
    }
    if (!thumbnail) {
        throw new ApiError(500, "Failed to upload thumbnail to Cloudinary")
    }

    // 4. Create the new Video document in MongoDB database
    // - videoFile.secure_url: HTTPS link served by Cloudinary CDN
    // - thumbnail.secure_url: HTTPS link served by Cloudinary CDN
    // - duration: Cloudinary automatically calculates video length (in seconds) during upload
    // - owner: ObjectId of authenticated user who published the video (from verifyJWT middleware)
    const video = await Video.create({
        videoFile: videoFile.secure_url, 
        thumbnail: thumbnail.secure_url,
        title: title.trim(),
        description: description.trim(),
        duration: videoFile.duration || 0, // Fallback to 0 if duration is missing
        owner: req.user._id,
        ispublished: true,                 // Default status on creation is published (true)
    })

    // 5. Send HTTP 201 (Created) response back to client with created document
    return res
        .status(201)
        .json(new ApiResponse(201, video, "Video published successfully"))
})

// ─────────────────────────────────────────────────────────────
// 2. GET ALL VIDEOS (Feed with search, filter, sort & pagination)
//    Route : GET /api/v1/videos?page=1&limit=10&query=title&sortBy=views&sortType=desc&userId=...
//    Auth  : Public (No JWT required for viewing video feed)
// ─────────────────────────────────────────────────────────────
/**
 * Overall Purpose

When someone opens YouTube's homepage, they expect to see videos. They may also:
search for videos
sort by views or upload date
view videos from one creator
load more videos as they scroll

This single function handles all of those requirements.
 */

const getAllVideos = asyncHandler(async (req, res) => {
    // Extract query parameters from URL with sensible default values
    const {
        page = 1,              // Current page number (starts at 1)
        limit = 10,            // Number of videos per page
        query,                 // Search keyword for matching video title
        sortBy = "createdAt",  // Field to sort by (e.g. "views", "duration", "createdAt")
        sortType = "desc",     // Sort order: "asc" (ascending) or "desc" (descending)
        userId,                // Optional: Filter videos published by a specific user/channel
    } = req.query

    // Array holding stages of MongoDB Aggregation Pipeline
    const pipeline = []

    // ── STAGE 1: Filter by publication status and optional userId owner ──
    // Only published videos (ispublished: true) should appear in public feeds.
    const matchStage = { ispublished: true }

    if (userId) {
        // isValidObjectId checks if string is a valid 24-character hex string suitable for MongoDB ObjectId
        if (!isValidObjectId(userId)) {
            throw new ApiError(400, "Invalid userId format")
        }
        // Must convert string userId to Mongoose ObjectId instance when querying inside Aggregation pipeline
        matchStage.owner = new mongoose.Types.ObjectId(userId)
    }

    pipeline.push({ $match: matchStage })

    // ── STAGE 2: Text search on video title using Regex ──
    // If user provided a query parameter (e.g., ?query=coding), perform case-insensitive regex search.
    // $options: "i" makes matching case-insensitive (matches "Coding", "CODING", "coding").
    if (query?.trim()) {
        pipeline.push({
            $match: {
                title: {
                    $regex: query.trim(),
                    $options: "i"
                }
            }
        })
    }

    // ── STAGE 3: Join User collection ($lookup) to attach Owner channel info ──
    // $lookup performs a SQL-like LEFT OUTER JOIN between "videos" collection and "users" collection.
    // from: Target collection name in MongoDB (must be lowercase and pluralized: "users").
    // localField: Field in video document ("owner").
    // foreignField: Field in user document ("_id").
    // as: Output array field name ("ownerDetails").
    pipeline.push(
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails",
                pipeline: [
                    {
                        // $project limits fields returned so sensitive fields like password/refreshToken are not exposed
                        $project: {
                            username: 1,
                            fullName: 1,
                            avatar: 1,
                        }
                    }
                ]
            }
        },
        {
            // $lookup returns an array of matching documents (e.g. ownerDetails: [{...}]).
            // $addFields with $first extracts the first object out of array: ownerDetails[0] -> owner object.
            $addFields: {
                owner: { $first: "$ownerDetails" }
            }
        }
    )

    // ── STAGE 4: Sorting results ──
    // MongoDB sort order: 1 = Ascending (A-Z, oldest first), -1 = Descending (Z-A, newest first).
    const sortOrder = sortType === "asc" ? 1 : -1
    pipeline.push({
        $sort: { [sortBy]: sortOrder }
    })

    // ── STAGE 5: Pagination using mongoose-aggregate-paginate-v2 plugin ──
    // The plugin injects aggregatePaginate() method into Video model.
    // It automatically appends $skip and $limit stages to pipeline and counts total documents.
    const options = {
        page: parseInt(page, 10),   // Page number as integer
        limit: parseInt(limit, 10), // Items per page as integer
    }

    const result = await Video.aggregatePaginate(
        Video.aggregate(pipeline),
        options
    )

    // Returns paginated result object containing `docs` (videos array), `totalDocs`, `limit`, `page`, `totalPages`, etc.
    return res
        .status(200)
        .json(new ApiResponse(200, result, "Videos fetched successfully"))
})

// ─────────────────────────────────────────────────────────────
// 3. GET VIDEO BY ID
//    Route : GET /api/v1/videos/:videoId
//    Auth  : Optional / Required (Updates watch history if user is logged in via verifyJWT)
// ─────────────────────────────────────────────────────────────
const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    // 1. Validate parameter format
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID format")
    }

    // 2. Increment video views count by 1 in MongoDB
    // $inc is an atomic update operator. It guarantees thread-safe view count increments
    // even when multiple concurrent requests hit this video simultaneously.
    await Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } })

    // 3. Query video using aggregation pipeline to populate owner profile
    const video = await Video.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(videoId),
                ispublished: true, // Only allow viewing published videos
            }
        },
        {
            // Join with "users" collection to retrieve creator channel details
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            fullName: 1,
                            avatar: 1,
                        }
                    }
                ]
            }
        },
        {
            // Convert owner array containing single object to direct object reference
            $addFields: {
                owner: { $first: "$owner" }
            }
        }
    ])

    // If video not found or unpublished, return 404
    if (!video?.length) {
        throw new ApiError(404, "Video not found")
    }

    // 4. Update user's watch history (if request comes from an authenticated user)
    // req.user is set if verifyJWT middleware ran prior to this controller.
    // $addToSet adds videoId to watchHistory array ONLY IF it is not already in the array (prevents duplicate entries).
    if (req.user) {
        await User.findByIdAndUpdate(req.user._id, {
            $addToSet: { watchHistory: videoId }
        })
    }

    // Return the matched video object (video[0] because aggregation returns an array)
    return res
        .status(200)
        .json(new ApiResponse(200, video[0], "Video fetched successfully"))
})

// ─────────────────────────────────────────────────────────────
// 4. UPDATE VIDEO (Title, Description, and/or Thumbnail)
//    Route : PATCH /api/v1/videos/:videoId
//    Body  : title (optional), description (optional)
//    File  : thumbnail (optional) -> via multer upload.single("thumbnail")
//    Auth  : Required (Only video owner can update)
// ─────────────────────────────────────────────────────────────
const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const { title, description } = req.body

    // 1. Validate ID
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID format")
    }

    // 2. Fetch video document from DB
    const video = await Video.findById(videoId)

    if (!video) {
        throw new ApiError(404, "Video not found")
    }

    // 3. Authorization Check: Ownership Verification
    // video.owner is a Mongoose ObjectId instance, req.user._id is also an ObjectId/String.
    // Comparing two ObjectId objects directly with === returns false because they are distinct memory references.
    // Converting both to string using .toString() ensures value comparison works as expected.
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to update this video")
    }

    // 4. Build dynamic update object with only fields provided by user
    const updateData = {}
    if (title?.trim()) updateData.title = title.trim()
    if (description?.trim()) updateData.description = description.trim()

    // 5. Handle optional thumbnail image replacement
    // Multer single file upload attaches file to `req.file` (singular, not req.files).
    const newThumbnailLocalPath = req.file?.path

    if (newThumbnailLocalPath) {
        // Upload new thumbnail to Cloudinary
        const newThumbnail = await uploadOnCloudinary(newThumbnailLocalPath)

        if (!newThumbnail) {
            throw new ApiError(500, "Failed to upload new thumbnail image")
        }

        // Store old thumbnail URL reference so we can delete it from Cloudinary after successful DB update
        const oldThumbnailUrl = video.thumbnail

        updateData.thumbnail = newThumbnail.secure_url

        // Cleanup: Remove old thumbnail file from Cloudinary CDN to prevent unused asset clutter
        if (oldThumbnailUrl) {
            await deleteFromCloudinary(oldThumbnailUrl)
        }
    }

    // 6. Update document in MongoDB
    // { $set: updateData } updates specified fields while leaving unmentioned fields untouched.
    // { new: true } returns the updated document instead of original pre-update document.
    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        { $set: updateData },
        { new: true }
    )

    return res
        .status(200)
        .json(new ApiResponse(200, updatedVideo, "Video updated successfully"))
})

// ─────────────────────────────────────────────────────────────
// 5. DELETE VIDEO
//    Route : DELETE /api/v1/videos/:videoId
//    Auth  : Required (Only video owner can delete)
// ─────────────────────────────────────────────────────────────
const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    // 1. Validate ID
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID format")
    }

    // 2. Fetch video document from DB
    const video = await Video.findById(videoId)

    if (!video) {
        throw new ApiError(404, "Video not found")
    }

    // 3. Authorization Check: Ownership Verification
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to delete this video")
    }

    // 4. Cleanup CDN storage: Delete video file & thumbnail from Cloudinary FIRST
    // Important: We attempt Cloudinary deletion before removing DB record so if DB deletion fails,
    // we still have reference to Cloudinary URLs if needed.
    await deleteFromCloudinary(video.videoFile)
    await deleteFromCloudinary(video.thumbnail)

    // 5. Delete document from MongoDB collection
    await Video.findByIdAndDelete(videoId)

    // Return empty payload in data object along with success message
    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Video deleted successfully"))
})

// ─────────────────────────────────────────────────────────────
// 6. TOGGLE PUBLISH STATUS (Public <-> Private)
//    Route : PATCH /api/v1/videos/toggle/publish/:videoId
//    Auth  : Required (Only video owner can toggle status)
// ─────────────────────────────────────────────────────────────
const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    // 1. Validate ID
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID format")
    }

    // 2. Fetch video document
    const video = await Video.findById(videoId)

    if (!video) {
        throw new ApiError(404, "Video not found")
    }

    // 3. Authorization Check: Ownership Verification
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to change publish status")
    }

    // 4. Invert boolean value of ispublished field (true -> false, false -> true)
    video.ispublished = !video.ispublished

    // Save document back to DB. { validateBeforeSave: false } avoids running full schema validator
    // since we are only flipping a single boolean flag on an existing valid document.
    await video.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { ispublished: video.ispublished },
                `Video is now ${video.ispublished ? "published" : "unpublished"}`
            )
        )
})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}
