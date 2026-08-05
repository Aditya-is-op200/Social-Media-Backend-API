import mongoose from "mongoose"
import { Video } from "../models/video.model.js"
import { Subscription } from "../models/subscription.model.js"
import { Like } from "../models/like.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

// ---------------------------------------------------------------------------
// 1. GET CHANNEL STATS
//    Route : GET /api/v1/dashboard/stats
//    Auth  : Required (req.user set by verifyJWT)
//
//    Returns: totalSubscribers, totalVideos, totalViews, totalLikes
// ---------------------------------------------------------------------------
const getChannelStats = asyncHandler(async (req, res) => {
    const channelId = new mongoose.Types.ObjectId(req.user._id)

    // Run all three aggregations in parallel for efficiency
    const [subscriberData, videoStats] = await Promise.all([

        // Total subscribers: count Subscription docs where channel === current user
        Subscription.aggregate([
            { $match: { channel: channelId } },
            { $count: "totalSubscribers" },
        ]),

        // Total videos, total views, and total likes — all derived from the videos collection
        Video.aggregate([
            { $match: { owner: channelId } },

            // Join likes collection to count likes per video
            {
                $lookup: {
                    from: "likes",
                    localField: "_id",
                    foreignField: "video",
                    as: "likes",
                },
            },

            // $group across ALL videos to produce a single summary document
            {
                $group: {
                    _id: null,
                    totalVideos: { $sum: 1 },
                    totalViews:  { $sum: "$views" },
                    totalLikes:  { $sum: { $size: "$likes" } },
                },
            },
        ]),
    ])

    const stats = {
        totalSubscribers: subscriberData[0]?.totalSubscribers ?? 0,
        totalVideos:      videoStats[0]?.totalVideos          ?? 0,
        totalViews:       videoStats[0]?.totalViews           ?? 0,
        totalLikes:       videoStats[0]?.totalLikes           ?? 0,
    }

    return res
        .status(200)
        .json(new ApiResponse(200, stats, "Channel stats fetched successfully"))
})

// ---------------------------------------------------------------------------
// 2. GET CHANNEL VIDEOS
//    Route : GET /api/v1/dashboard/videos
//    Auth  : Required
//
//    Returns all videos uploaded by the authenticated channel owner,
//    each enriched with its like count, sorted newest first.
// ---------------------------------------------------------------------------
const getChannelVideos = asyncHandler(async (req, res) => {
    const channelId = new mongoose.Types.ObjectId(req.user._id)

    const videos = await Video.aggregate([
        // Only fetch videos belonging to this channel
        { $match: { owner: channelId } },

        // Join likes so we can count how many likes each video has
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likes",
            },
        },

        // Shape the output — expose likeCount instead of the raw likes array
        {
            $project: {
                title:       1,
                description: 1,
                thumbnail:   1,
                videoFile:   1,
                duration:    1,
                views:       1,
                ispublished: 1,
                createdAt:   1,
                likeCount: { $size: "$likes" },
            },
        },

        { $sort: { createdAt: -1 } },
    ])

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { videos, total: videos.length },
                "Channel videos fetched successfully"
            )
        )
})

export {
    getChannelStats,
    getChannelVideos,
}
