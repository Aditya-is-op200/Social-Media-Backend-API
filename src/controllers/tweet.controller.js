import mongoose, { isValidObjectId } from "mongoose"
import { Tweet } from "../models/tweet.model.js"
import { User } from "../models/user.model.js"
import { Like } from "../models/like.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

/* =============================================================================
   TWEET CONTROLLER - DETAILED IMPLEMENTATION GUIDE

   This controller handles all Twitter-style short text posts:
   1. createTweet    -> Creates a new tweet associated with the logged-in user
   2. getUserTweets   -> Fetches all tweets from a specific user enriched with
                         owner details and like metrics
   3. updateTweet    -> Updates content of an existing tweet (owner only)
   4. deleteTweet    -> Deletes tweet and removes associated likes (owner only)
   ============================================================================= */

// ---------------------------------------------------------------------------
// 1. CREATE TWEET
//    Route : POST /api/v1/tweets/
//    Body  : content (String)
//    Auth  : Required (req.user is set by verifyJWT)
// ---------------------------------------------------------------------------
const createTweet = asyncHandler(async (req, res) => {
    const { content } = req.body

    // Validate that content is non-empty after trimming whitespace
    if (!content?.trim()) {
        throw new ApiError(400, "Tweet content is required")
    }

    const tweet = await Tweet.create({
        content: content.trim(),
        owner: req.user._id
    })

    if (!tweet) {
        throw new ApiError(500, "Failed to create tweet")
    }

    return res
        .status(201)
        .json(new ApiResponse(201, tweet, "Tweet created successfully"))
})

// ---------------------------------------------------------------------------
// 2. GET USER TWEETS
//    Route : GET /api/v1/tweets/user/:userId
//    Params: userId (MongoDB ObjectId string)
//    Auth  : Required
// ---------------------------------------------------------------------------
const getUserTweets = asyncHandler(async (req, res) => {
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

    const tweets = await Tweet.aggregate([
        // Stage 1: Match tweets authored by the specified user
        {
            $match: {
                owner: new mongoose.Types.ObjectId(userId)
            }
        },

        // Stage 2: Join owner details from users collection
        {
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

        // Stage 3: Join likes to count likes and determine isLiked for the requester
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "tweet",
                as: "likes"
            }
        },
        {
            $addFields: {
                likesCount: { $size: "$likes" },
                isLiked: {
                    $cond: {
                        if: {
                            $in: [
                                new mongoose.Types.ObjectId(req.user?._id),
                                "$likes.likedBy"
                            ]
                        },
                        then: true,
                        else: false
                    }
                }
            }
        },

        // Stage 4: Drop the raw likes array
        {
            $project: {
                likes: 0
            }
        },

        // Stage 5: Sort newest tweets first
        {
            $sort: { createdAt: -1 }
        }
    ])

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { tweets, total: tweets.length },
                "User tweets fetched successfully"
            )
        )
})

// ---------------------------------------------------------------------------
// 3. UPDATE TWEET
//    Route : PATCH /api/v1/tweets/:tweetId
//    Params: tweetId (MongoDB ObjectId string)
//    Body  : content (String)
//    Auth  : Required
// ---------------------------------------------------------------------------
const updateTweet = asyncHandler(async (req, res) => {
    const { tweetId } = req.params
    const { content } = req.body

    // Guard: Validate ObjectId format
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweet ID format")
    }

    // Validate updated content
    if (!content?.trim()) {
        throw new ApiError(400, "Tweet content cannot be empty")
    }

    const tweet = await Tweet.findById(tweetId)
    if (!tweet) {
        throw new ApiError(404, "Tweet not found")
    }

    // Ownership check: only creator can edit
    if (tweet.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to edit this tweet")
    }

    tweet.content = content.trim()
    await tweet.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(new ApiResponse(200, tweet, "Tweet updated successfully"))
})

// ---------------------------------------------------------------------------
// 4. DELETE TWEET
//    Route : DELETE /api/v1/tweets/:tweetId
//    Params: tweetId (MongoDB ObjectId string)
//    Auth  : Required
// ---------------------------------------------------------------------------
const deleteTweet = asyncHandler(async (req, res) => {
    const { tweetId } = req.params

    // Guard: Validate ObjectId format
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweet ID format")
    }

    const tweet = await Tweet.findById(tweetId)
    if (!tweet) {
        throw new ApiError(404, "Tweet not found")
    }

    // Ownership check: only creator can delete
    if (tweet.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to delete this tweet")
    }

    await Tweet.findByIdAndDelete(tweetId)

    // Cascade delete: remove all likes for this tweet
    await Like.deleteMany({ tweet: tweetId })

    return res
        .status(200)
        .json(new ApiResponse(200, { tweetId }, "Tweet deleted successfully"))
})

export {
    createTweet,
    getUserTweets,
    updateTweet,
    deleteTweet
}
