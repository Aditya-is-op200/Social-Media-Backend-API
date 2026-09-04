import mongoose, { isValidObjectId } from "mongoose"
import { User } from "../models/user.model.js"
import { Subscription } from "../models/subscription.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

/* =============================================================================
   SUBSCRIPTION CONTROLLER - DETAILED IMPLEMENTATION GUIDE

   This controller handles YouTube-style channel subscriptions:
   1. toggleSubscription         -> Subscribes or unsubscribes from a channel
   2. getUserChannelSubscribers  -> Returns all users subscribed to a given channel
   3. getSubscribedChannels      -> Returns all channels a given user has subscribed to
   ============================================================================= */

// ---------------------------------------------------------------------------
// 1. TOGGLE SUBSCRIPTION
//    Route : POST /api/v1/subscriptions/c/:channelId
//    Params: channelId (MongoDB ObjectId string of channel/user)
//    Auth  : Required (req.user is set by verifyJWT)
// ---------------------------------------------------------------------------
const toggleSubscription = asyncHandler(async (req, res) => {
    const { channelId } = req.params

    // Guard: Validate ObjectId format
    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid channel ID format")
    }

    // Prevent user from subscribing to their own channel
    if (channelId.toString() === req.user._id.toString()) {
        throw new ApiError(400, "You cannot subscribe to your own channel")
    }

    // Verify target channel/user exists
    const channel = await User.findById(channelId)
    if (!channel) {
        throw new ApiError(404, "Channel not found")
    }

    // Check if subscription document already exists
    const existingSubscription = await Subscription.findOne({
        channel: channelId,
        subscriber: req.user._id
    })

    if (existingSubscription) {
        // If already subscribed, remove the subscription (unsubscribe)
        await Subscription.findByIdAndDelete(existingSubscription._id)

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    { subscribed: false },
                    "Unsubscribed successfully"
                )
            )
    }

    // Otherwise, create a new subscription
    await Subscription.create({
        channel: channelId,
        subscriber: req.user._id
    })

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { subscribed: true },
                "Subscribed successfully"
            )
        )
})

// ---------------------------------------------------------------------------
// 2. GET USER CHANNEL SUBSCRIBERS
//    Route : GET /api/v1/subscriptions/c/:channelId
//    Params: channelId (or fallback subscriberId)
//    Auth  : Required
// ---------------------------------------------------------------------------
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
    // Gracefully handle either parameter name for resilience
    const targetChannelId = req.params.channelId || req.params.subscriberId

    if (!isValidObjectId(targetChannelId)) {
        throw new ApiError(400, "Invalid channel ID format")
    }

    const channel = await User.findById(targetChannelId)
    if (!channel) {
        throw new ApiError(404, "Channel not found")
    }

    const subscribers = await Subscription.aggregate([
        // Stage 1: Match subscriptions where target channel is the subscribed channel
        {
            $match: {
                channel: new mongoose.Types.ObjectId(targetChannelId)
            }
        },

        // Stage 2: Join subscriber user profile details
        {
            $lookup: {
                from: "users",
                localField: "subscriber",
                foreignField: "_id",
                as: "subscriber",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            fullName: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },
        {
            $addFields: {
                subscriber: { $first: "$subscriber" }
            }
        },

        // Stage 3: Check if the logged-in user is subscribed back to this subscriber
        {
            $lookup: {
                from: "subscriptions",
                let: { subscriberId: "$subscriber._id" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$channel", "$$subscriberId"] },
                                    { $eq: ["$subscriber", new mongoose.Types.ObjectId(req.user._id)] }
                                ]
                            }
                        }
                    }
                ],
                as: "isSubscribedBack"
            }
        },
        {
            $addFields: {
                "subscriber.isSubscribed": {
                    $cond: {
                        if: { $gt: [{ $size: "$isSubscribedBack" }, 0] },
                        then: true,
                        else: false
                    }
                }
            }
        },

        // Stage 4: Reshape output
        {
            $project: {
                _id: 1,
                subscriber: 1,
                createdAt: 1
            }
        },

        // Stage 5: Sort newest subscribers first
        {
            $sort: { createdAt: -1 }
        }
    ])

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {
                    subscribers,
                    totalSubscribers: subscribers.length
                },
                "Channel subscribers fetched successfully"
            )
        )
})

// ---------------------------------------------------------------------------
// 3. GET SUBSCRIBED CHANNELS
//    Route : GET /api/v1/subscriptions/u/:subscriberId
//    Params: subscriberId (or fallback channelId)
//    Auth  : Required
// ---------------------------------------------------------------------------
const getSubscribedChannels = asyncHandler(async (req, res) => {
    // Gracefully handle either parameter name for resilience
    const targetSubscriberId = req.params.subscriberId || req.params.channelId

    if (!isValidObjectId(targetSubscriberId)) {
        throw new ApiError(400, "Invalid subscriber ID format")
    }

    const user = await User.findById(targetSubscriberId)
    if (!user) {
        throw new ApiError(404, "User not found")
    }

    const subscribedChannels = await Subscription.aggregate([
        // Stage 1: Match subscriptions initiated by this subscriber
        {
            $match: {
                subscriber: new mongoose.Types.ObjectId(targetSubscriberId)
            }
        },

        // Stage 2: Join channel user profile details
        {
            $lookup: {
                from: "users",
                localField: "channel",
                foreignField: "_id",
                as: "channel",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            fullName: 1,
                            avatar: 1
                        }
                    }
                ]
            }
        },
        {
            $addFields: {
                channel: { $first: "$channel" }
            }
        },

        // Stage 3: Join latest video for preview if available
        {
            $lookup: {
                from: "videos",
                let: { channelId: "$channel._id" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$owner", "$$channelId"] },
                                    { $eq: ["$ispublished", true] }
                                ]
                            }
                        }
                    },
                    { $sort: { createdAt: -1 } },
                    { $limit: 1 },
                    {
                        $project: {
                            videoFile: 1,
                            thumbnail: 1,
                            title: 1,
                            duration: 1,
                            views: 1
                        }
                    }
                ],
                as: "latestVideo"
            }
        },
        {
            $addFields: {
                "channel.latestVideo": { $first: "$latestVideo" }
            }
        },

        // Stage 4: Reshape output
        {
            $project: {
                _id: 1,
                channel: 1,
                createdAt: 1
            }
        },

        // Stage 5: Sort newest subscriptions first
        {
            $sort: { createdAt: -1 }
        }
    ])

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {
                    subscribedChannels,
                    totalSubscribedChannels: subscribedChannels.length
                },
                "Subscribed channels fetched successfully"
            )
        )
})

export {
    toggleSubscription,
    getUserChannelSubscribers,
    getSubscribedChannels
}
