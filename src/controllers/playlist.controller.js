import mongoose, { isValidObjectId } from "mongoose"
import { Playlist } from "../models/playlist.model.js"
import { Video } from "../models/video.model.js"
import { User } from "../models/user.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

/* =============================================================================
   PLAYLIST CONTROLLER - DETAILED IMPLEMENTATION GUIDE

   This controller handles all playlist-related functionality:
   1. createPlaylist          -> Creates a new custom playlist
   2. getUserPlaylists        -> Fetches all playlists created by a specific user
   3. getPlaylistById         -> Fetches single playlist with populated videos & owner
   4. addVideoToPlaylist      -> Adds a video into an existing playlist (owner only)
   5. removeVideoFromPlaylist -> Removes a video from a playlist (owner only)
   6. deletePlaylist          -> Deletes a playlist document (owner only)
   7. updatePlaylist          -> Updates name/description of a playlist (owner only)
   ============================================================================= */

// ---------------------------------------------------------------------------
// 1. CREATE PLAYLIST
//    Route : POST /api/v1/playlist/
//    Body  : name (String), description (String)
//    Auth  : Required (req.user is set by verifyJWT)
// ---------------------------------------------------------------------------
const createPlaylist = asyncHandler(async (req, res) => {
    const { name, description } = req.body

    // Validate name and description
    if (!name?.trim() || !description?.trim()) {
        throw new ApiError(400, "Name and description are required")
    }

    const playlist = await Playlist.create({
        name: name.trim(),
        description: description.trim(),
        owner: req.user._id,
        videos: []
    })

    if (!playlist) {
        throw new ApiError(500, "Failed to create playlist")
    }

    return res
        .status(201)
        .json(new ApiResponse(201, playlist, "Playlist created successfully"))
})

// ---------------------------------------------------------------------------
// 2. GET USER PLAYLISTS
//    Route : GET /api/v1/playlist/user/:userId
//    Params: userId (MongoDB ObjectId string)
//    Auth  : Required
// ---------------------------------------------------------------------------
const getUserPlaylists = asyncHandler(async (req, res) => {
    const { userId } = req.params

    // Guard: Validate ObjectId format
    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid user ID format")
    }

    // Verify user exists in the database
    const user = await User.findById(userId)
    if (!user) {
        throw new ApiError(404, "User not found")
    }

    const playlists = await Playlist.aggregate([
        // Stage 1: Match playlists owned by the requested user
        {
            $match: {
                owner: new mongoose.Types.ObjectId(userId)
            }
        },

        // Stage 2: Join the first video's thumbnail to use as playlist cover
        {
            $lookup: {
                from: "videos",
                localField: "videos",
                foreignField: "_id",
                as: "videoPreview",
                pipeline: [
                    { $sort: { createdAt: -1 } },
                    { $limit: 1 },
                    {
                        $project: {
                            thumbnail: 1,
                            videoFile: 1,
                            title: 1,
                            duration: 1
                        }
                    }
                ]
            }
        },

        // Stage 3: Add computed metrics (total videos, cover thumbnail)
        {
            $addFields: {
                totalVideos: { $size: "$videos" },
                coverThumbnail: { $first: "$videoPreview.thumbnail" }
            }
        },

        // Stage 4: Drop preview array to keep payload compact
        {
            $project: {
                videoPreview: 0
            }
        },

        // Stage 5: Sort newest playlists first
        {
            $sort: { createdAt: -1 }
        }
    ])

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { playlists, totalPlaylists: playlists.length },
                "User playlists fetched successfully"
            )
        )
})

// ---------------------------------------------------------------------------
// 3. GET PLAYLIST BY ID
//    Route : GET /api/v1/playlist/:playlistId
//    Params: playlistId (MongoDB ObjectId string)
//    Auth  : Required
// ---------------------------------------------------------------------------
const getPlaylistById = asyncHandler(async (req, res) => {
    const { playlistId } = req.params

    // Guard: Validate ObjectId format
    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid playlist ID format")
    }

    const playlist = await Playlist.aggregate([
        // Stage 1: Match playlist by ID
        {
            $match: {
                _id: new mongoose.Types.ObjectId(playlistId)
            }
        },

        // Stage 2: Populate playlist owner details
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $project: {
                            fullName: 1,
                            username: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },
        {
            $addFields: {
                owner: { $first: "$owner" }
            }
        },

        // Stage 3: Populate videos in playlist along with each video's creator details
        {
            $lookup: {
                from: "videos",
                localField: "videos",
                foreignField: "_id",
                as: "videos",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: { $first: "$owner" }
                        }
                    },
                    {
                        $project: {
                            title: 1,
                            description: 1,
                            thumbnail: 1,
                            videoFile: 1,
                            duration: 1,
                            views: 1,
                            ispublished: 1,
                            createdAt: 1,
                            owner: 1
                        }
                    }
                ]
            }
        },

        // Stage 4: Add total videos count
        {
            $addFields: {
                totalVideos: { $size: "$videos" }
            }
        }
    ])

    if (!playlist?.length) {
        throw new ApiError(404, "Playlist not found")
    }

    return res
        .status(200)
        .json(new ApiResponse(200, playlist[0], "Playlist fetched successfully"))
})

// ---------------------------------------------------------------------------
// 4. ADD VIDEO TO PLAYLIST
//    Route : PATCH /api/v1/playlist/add/:videoId/:playlistId
//    Params: playlistId, videoId (MongoDB ObjectId strings)
//    Auth  : Required
// ---------------------------------------------------------------------------
const addVideoToPlaylist = asyncHandler(async (req, res) => {
    const { playlistId, videoId } = req.params

    // Guard: Validate ObjectId formats
    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid playlist ID format")
    }
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID format")
    }

    // Verify video exists
    const video = await Video.findById(videoId)
    if (!video) {
        throw new ApiError(404, "Video not found")
    }

    // Find target playlist
    const playlist = await Playlist.findById(playlistId)
    if (!playlist) {
        throw new ApiError(404, "Playlist not found")
    }

    // Authorization: only playlist owner can add videos
    if (playlist.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to add videos to this playlist")
    }

    // Guard against duplicate video entries
    if (playlist.videos.some((id) => id.toString() === videoId.toString())) {
        throw new ApiError(400, "Video is already present in this playlist")
    }

    playlist.videos.push(videoId)
    await playlist.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(new ApiResponse(200, playlist, "Video added to playlist successfully"))
})

// ---------------------------------------------------------------------------
// 5. REMOVE VIDEO FROM PLAYLIST
//    Route : PATCH /api/v1/playlist/remove/:videoId/:playlistId
//    Params: playlistId, videoId (MongoDB ObjectId strings)
//    Auth  : Required
// ---------------------------------------------------------------------------
const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
    const { playlistId, videoId } = req.params

    // Guard: Validate ObjectId formats
    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid playlist ID format")
    }
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID format")
    }

    // Find target playlist
    const playlist = await Playlist.findById(playlistId)
    if (!playlist) {
        throw new ApiError(404, "Playlist not found")
    }

    // Authorization: only playlist owner can remove videos
    if (playlist.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to remove videos from this playlist")
    }

    // Check if video exists in this playlist
    const videoExistsInPlaylist = playlist.videos.some(
        (id) => id.toString() === videoId.toString()
    )
    if (!videoExistsInPlaylist) {
        throw new ApiError(400, "Video not found in this playlist")
    }

    // Filter out the videoId
    playlist.videos = playlist.videos.filter(
        (id) => id.toString() !== videoId.toString()
    )
    await playlist.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(new ApiResponse(200, playlist, "Video removed from playlist successfully"))
})

// ---------------------------------------------------------------------------
// 6. DELETE PLAYLIST
//    Route : DELETE /api/v1/playlist/:playlistId
//    Params: playlistId (MongoDB ObjectId string)
//    Auth  : Required
// ---------------------------------------------------------------------------
const deletePlaylist = asyncHandler(async (req, res) => {
    const { playlistId } = req.params

    // Guard: Validate ObjectId format
    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid playlist ID format")
    }

    const playlist = await Playlist.findById(playlistId)
    if (!playlist) {
        throw new ApiError(404, "Playlist not found")
    }

    // Authorization: only playlist owner can delete
    if (playlist.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to delete this playlist")
    }

    await Playlist.findByIdAndDelete(playlistId)

    return res
        .status(200)
        .json(new ApiResponse(200, { playlistId }, "Playlist deleted successfully"))
})

// ---------------------------------------------------------------------------
// 7. UPDATE PLAYLIST
//    Route : PATCH /api/v1/playlist/:playlistId
//    Params: playlistId (MongoDB ObjectId string)
//    Body  : name (String, optional), description (String, optional)
//    Auth  : Required
// ---------------------------------------------------------------------------
const updatePlaylist = asyncHandler(async (req, res) => {
    const { playlistId } = req.params
    const { name, description } = req.body

    // Guard: Validate ObjectId format
    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid playlist ID format")
    }

    // Ensure at least one field is provided for update
    if (!name?.trim() && !description?.trim()) {
        throw new ApiError(400, "At least one field (name or description) is required to update")
    }

    const playlist = await Playlist.findById(playlistId)
    if (!playlist) {
        throw new ApiError(404, "Playlist not found")
    }

    // Authorization: only playlist owner can update
    if (playlist.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to update this playlist")
    }

    if (name?.trim()) {
        playlist.name = name.trim()
    }
    if (description?.trim()) {
        playlist.description = description.trim()
    }

    await playlist.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(new ApiResponse(200, playlist, "Playlist updated successfully"))
})

export {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
    deletePlaylist,
    updatePlaylist
}
