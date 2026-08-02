import mongoose, { isValidObjectId } from "mongoose"
import { Video } from "../models/video.model.js"
import { User } from "../models/user.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js"

// ─────────────────────────────────────────────────────────────
// 1. PUBLISH A VIDEO
//    POST /api/v1/videos/
//    Body   : title, description
//    Files  : videoFile, thumbnail  (via multer)
//    Auth   : required (verifyJWT)
// ─────────────────────────────────────────────────────────────
const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body

    // Step 1 — Validate text fields
    if (!title?.trim() || !description?.trim()) {
        throw new ApiError(400, "Title and description are required")
    }

    // Step 2 — Confirm files were attached by multer
    // req.files is populated by upload.fields([{name:"videoFile"},{name:"thumbnail"}])
    const videoFileLocalPath = req.files?.videoFile?.[0]?.path
    const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path

    if (!videoFileLocalPath) {
        throw new ApiError(400, "Video file is required")
    }
    if (!thumbnailLocalPath) {
        throw new ApiError(400, "Thumbnail is required")
    }

    // Step 3 — Upload both files to Cloudinary
    // Cloudinary auto-detects resource_type (video vs image) because of resource_type:"auto"
    const videoFile = await uploadOnCloudinary(videoFileLocalPath)
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)

    if (!videoFile) {
        throw new ApiError(500, "Failed to upload video to Cloudinary")
    }
    if (!thumbnail) {
        throw new ApiError(500, "Failed to upload thumbnail to Cloudinary")
    }

    // Step 4 — Create the Video document in MongoDB
    // duration comes from Cloudinary's response — it measures the video length in seconds
    const video = await Video.create({
        videoFile: videoFile.secure_url,
        thumbnail: thumbnail.secure_url,
        title: title.trim(),
        description: description.trim(),
        duration: videoFile.duration,       // Cloudinary returns this for video uploads
        owner: req.user._id,               // set from verifyJWT middleware
        ispublished: true,                  // published immediately on upload
    })

    // Step 5 — Return the newly created video
    return res
        .status(201)
        .json(new ApiResponse(201, video, "Video published successfully"))
})

// ─────────────────────────────────────────────────────────────
// 2. GET ALL VIDEOS  (with search, sort, pagination)
//    GET /api/v1/videos?page=1&limit=10&query=title&sortBy=views&sortType=desc&userId=...
//    Auth   : not required (public feed)
// ─────────────────────────────────────────────────────────────
const getAllVideos = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 10,
        query,          // text search on title
        sortBy = "createdAt",
        sortType = "desc",
        userId,         // filter by a specific channel's videos
    } = req.query

    // Build the aggregation pipeline step by step
    const pipeline = []

    // ── Stage 1: Filter by published status + optional userId ──
    const matchStage = { ispublished: true }

    if (userId) {
        if (!isValidObjectId(userId)) {
            throw new ApiError(400, "Invalid userId")
        }
        matchStage.owner = new mongoose.Types.ObjectId(userId)
    }

    pipeline.push({ $match: matchStage })

    // ── Stage 2: Text search on title (if query param provided) ──
    // $regex lets us do a case-insensitive partial match on the title field
    if (query?.trim()) {
        pipeline.push({
            $match: {
                title: {
                    $regex: query.trim(),
                    $options: "i"   // "i" = case-insensitive
                }
            }
        })
    }

    // ── Stage 3: Lookup owner details from the users collection ──
    // This joins the "users" collection on video.owner = user._id
    pipeline.push(
        {
            $lookup: {
                from: "users",          // MongoDB collection name (lowercase + plural)
                localField: "owner",    // field in Video document
                foreignField: "_id",    // field in User document
                as: "ownerDetails",     // result array name
                pipeline: [
                    {
                        // Only project the fields we actually need — avoids leaking password etc.
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
            // $lookup always returns an array — $first unwraps the single owner object
            $addFields: {
                owner: { $first: "$ownerDetails" }
            }
        }
    )

    // ── Stage 4: Sort ──
    // sortType is "asc" or "desc" → convert to 1 or -1 (MongoDB sort values)
    const sortOrder = sortType === "asc" ? 1 : -1
    pipeline.push({
        $sort: { [sortBy]: sortOrder }
    })

    // ── Pagination via aggregatePaginate plugin ──
    // The plugin handles $skip and $limit automatically based on page + limit
    const options = {
        page: parseInt(page),
        limit: parseInt(limit),
    }

    const result = await Video.aggregatePaginate(
        Video.aggregate(pipeline),
        options
    )

    return res
        .status(200)
        .json(new ApiResponse(200, result, "Videos fetched successfully"))
})

// ─────────────────────────────────────────────────────────────
// 3. GET VIDEO BY ID
//    GET /api/v1/videos/:videoId
//    Auth   : optional (verifyJWT is applied on router but watch history update only runs if user exists)
// ─────────────────────────────────────────────────────────────
const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    // Step 1 — Validate that videoId is a proper MongoDB ObjectId string
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }

    // Step 2 — Increment view count atomically BEFORE fetching
    // $inc is atomic in MongoDB — no race condition if two people open the video at the same time
    await Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } })

    // Step 3 — Aggregate to get video + owner details in one query
    const video = await Video.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(videoId),
                ispublished: true,
            }
        },
        {
            // Join with users to get owner profile
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
            // Unwrap the owner array into a single object
            $addFields: {
                owner: { $first: "$owner" }
            }
        }
    ])

    if (!video?.length) {
        throw new ApiError(404, "Video not found")
    }

    // Step 4 — Add to watch history if a user is logged in
    // We use $addToSet instead of $push to prevent duplicate entries
    if (req.user) {
        await User.findByIdAndUpdate(req.user._id, {
            $addToSet: { watchHistory: videoId }
        })
    }

    return res
        .status(200)
        .json(new ApiResponse(200, video[0], "Video fetched successfully"))
})

// ─────────────────────────────────────────────────────────────
// 4. UPDATE VIDEO  (title, description, thumbnail)
//    PATCH /api/v1/videos/:videoId
//    Body  : title?, description?
//    File  : thumbnail? (optional new thumbnail)
//    Auth  : required + must be owner
// ─────────────────────────────────────────────────────────────
const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const { title, description } = req.body

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }

    // Step 1 — Find the video
    const video = await Video.findById(videoId)

    if (!video) {
        throw new ApiError(404, "Video not found")
    }

    // Step 2 — Ownership check
    // Only the person who uploaded the video can edit it
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to update this video")
    }

    // Step 3 — Build the update object with only the provided fields
    const updateData = {}
    if (title?.trim())       updateData.title = title.trim()
    if (description?.trim()) updateData.description = description.trim()

    // Step 4 — Handle optional thumbnail replacement
    const newThumbnailLocalPath = req.file?.path   // multer puts single file in req.file

    if (newThumbnailLocalPath) {
        // Upload the new thumbnail first
        const newThumbnail = await uploadOnCloudinary(newThumbnailLocalPath)

        if (!newThumbnail) {
            throw new ApiError(500, "Failed to upload new thumbnail")
        }

        // Store old URL before overwriting — we'll delete it after DB update
        const oldThumbnailUrl = video.thumbnail

        updateData.thumbnail = newThumbnail.secure_url

        // Delete old thumbnail from Cloudinary to avoid storage waste
        if (oldThumbnailUrl) {
            await deleteFromCloudinary(oldThumbnailUrl)
        }
    }

    // Step 5 — Apply the update
    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        { $set: updateData },
        { new: true }           // return the updated document, not the old one
    )

    return res
        .status(200)
        .json(new ApiResponse(200, updatedVideo, "Video updated successfully"))
})

// ─────────────────────────────────────────────────────────────
// 5. DELETE VIDEO
//    DELETE /api/v1/videos/:videoId
//    Auth   : required + must be owner
// ─────────────────────────────────────────────────────────────
const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }

    // Step 1 — Find the video
    const video = await Video.findById(videoId)

    if (!video) {
        throw new ApiError(404, "Video not found")
    }

    // Step 2 — Ownership check
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to delete this video")
    }

    // Step 3 — Delete both files from Cloudinary BEFORE removing the DB record
    // If we deleted DB first and Cloudinary failed, the file would be orphaned forever
    await deleteFromCloudinary(video.videoFile)
    await deleteFromCloudinary(video.thumbnail)

    // Step 4 — Delete the MongoDB document
    await Video.findByIdAndDelete(videoId)

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Video deleted successfully"))
})

// ─────────────────────────────────────────────────────────────
// 6. TOGGLE PUBLISH STATUS
//    PATCH /api/v1/videos/toggle/publish/:videoId
//    Auth  : required + must be owner
// ─────────────────────────────────────────────────────────────
const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }

    // Step 1 — Find the video
    const video = await Video.findById(videoId)

    if (!video) {
        throw new ApiError(404, "Video not found")
    }

    // Step 2 — Ownership check
    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to change publish status")
    }

    // Step 3 — Flip the boolean and save
    // !video.ispublished  →  true becomes false, false becomes true
    video.ispublished = !video.ispublished
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
