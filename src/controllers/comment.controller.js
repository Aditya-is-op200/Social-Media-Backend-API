import mongoose, { isValidObjectId } from "mongoose"
import { Comment } from "../models/comment.model.js"
import { Video } from "../models/video.model.js"
import { Like } from "../models/like.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

/* =============================================================================
   COMMENT CONTROLLER - DETAILED IMPLEMENTATION GUIDE

   This controller handles all comment-related features:
   1. getVideoComments -> Fetches paginated comments with user profile & like stats
   2. addComment       -> Adds a new comment under a video
   3. updateComment    -> Updates comment content (owner only)
   4. deleteComment    -> Deletes comment and cascades deletion of comment likes
   ============================================================================= */

// ---------------------------------------------------------------------------
// 1. GET ALL COMMENTS FOR A VIDEO
//    Route : GET /api/v1/comments/:videoId?page=1&limit=10
//    Params: videoId (MongoDB ObjectId string)
//    Query : page, limit
//    Auth  : Required (req.user populated by verifyJWT)
// ---------------------------------------------------------------------------
const getVideoComments = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const { page = 1, limit = 10 } = req.query

    // Guard: Validate ObjectId format
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID format")
    }

    // Verify that the video exists
    const video = await Video.findById(videoId)
    if (!video) {
        throw new ApiError(404, "Video not found")
    }

    // Aggregation pipeline to enrich each comment with owner details & like metrics
    const pipeline = [
        // Stage 1: Filter comments belonging to this video
        {
            $match: {
                video: new mongoose.Types.ObjectId(videoId)
            }
        },

        // Stage 2: Join owner user profile
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

        // Stage 3: Join likes collection to count likes and check if requester liked it
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "comment",
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

        // Stage 4: Drop raw likes array to keep payload lightweight
        {
            $project: {
                likes: 0
            }
        },

        // Stage 5: Sort newest comments first
        {
            $sort: { createdAt: -1 }
        }
    ]

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
    }

    const comments = await Comment.aggregatePaginate(
        Comment.aggregate(pipeline),
        options
    )

    return res
        .status(200)
        .json(new ApiResponse(200, comments, "Video comments fetched successfully"))
})

// ---------------------------------------------------------------------------
// 2. ADD A COMMENT TO A VIDEO
//    Route : POST /api/v1/comments/:videoId
//    Params: videoId (MongoDB ObjectId string)
//    Body  : content (String)
//    Auth  : Required
// ---------------------------------------------------------------------------
const addComment = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const { content } = req.body

    // Guard: Validate ObjectId format
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID format")
    }

    // Validate comment content
    if (!content?.trim()) {
        throw new ApiError(400, "Comment content is required")
    }

    // Verify that the video exists before attaching a comment
    const video = await Video.findById(videoId)
    if (!video) {
        throw new ApiError(404, "Video not found")
    }

    const comment = await Comment.create({
        content: content.trim(),
        video: videoId,
        owner: req.user._id
    })

    if (!comment) {
        throw new ApiError(500, "Failed to create comment")
    }

    return res
        .status(201)
        .json(new ApiResponse(201, comment, "Comment added successfully"))
})

// ---------------------------------------------------------------------------
// 3. UPDATE A COMMENT
//    Route : PATCH /api/v1/comments/c/:commentId
//    Params: commentId (MongoDB ObjectId string)
//    Body  : content (String)
//    Auth  : Required
// ---------------------------------------------------------------------------
const updateComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params
    const { content } = req.body

    // Guard: Validate ObjectId format
    if (!isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid comment ID format")
    }

    // Validate new content
    if (!content?.trim()) {
        throw new ApiError(400, "Comment content cannot be empty")
    }

    // Find comment in DB
    const comment = await Comment.findById(commentId)
    if (!comment) {
        throw new ApiError(404, "Comment not found")
    }

    // Authorization: only the comment owner can update
    if (comment.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to update this comment")
    }

    comment.content = content.trim()
    await comment.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(new ApiResponse(200, comment, "Comment updated successfully"))
})

// ---------------------------------------------------------------------------
// 4. DELETE A COMMENT
//    Route : DELETE /api/v1/comments/c/:commentId
//    Params: commentId (MongoDB ObjectId string)
//    Auth  : Required
// ---------------------------------------------------------------------------
const deleteComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params

    // Guard: Validate ObjectId format
    if (!isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid comment ID format")
    }

    // Find comment in DB
    const comment = await Comment.findById(commentId)
    if (!comment) {
        throw new ApiError(404, "Comment not found")
    }

    // Authorization: only the comment owner can delete
    if (comment.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to delete this comment")
    }

    // Remove comment document
    await Comment.findByIdAndDelete(commentId)

    // Cascade delete: remove all likes referencing this comment
    await Like.deleteMany({ comment: commentId })

    return res
        .status(200)
        .json(new ApiResponse(200, { commentId }, "Comment deleted successfully"))
})

export {
    getVideoComments,
    addComment,
    updateComment,
    deleteComment
}
