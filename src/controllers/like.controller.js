import mongoose, { isValidObjectId } from "mongoose"
import { Like } from "../models/like.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

/* =============================================================================
   LIKE CONTROLLER - DETAILED TUTORIAL & IMPLEMENTATION GUIDE

   THE LIKE MODEL (like.model.js) has this schema:
   +---------------------------------------------+
   |  {                                          |
   |    video   : ObjectId ref "Video"           |
   |    comment : ObjectId ref "Comment"         |
   |    tweet   : ObjectId ref "Tweet"           |
   |    likedBy : ObjectId ref "User"            |
   |  }                                          |
   +---------------------------------------------+
   One Like document = one user liking ONE thing (video / comment / tweet).
   Only one of the three reference fields (video/comment/tweet) is populated
   per document -- the other two are simply absent (undefined).

   THE TOGGLE PATTERN (used by all three toggle handlers):
   --------------------------------------------------------
   Toggle = "if it exists, delete it; if it doesn't, create it"
   This is how every major platform (YouTube, Twitter, Instagram) implements likes.

   Step 1  isValidObjectId(id)
            Mongoose utility that checks if the string is a valid 24-character
            hex MongoDB ObjectId. Catches garbage input before hitting the DB.

   Step 2  Like.findOne({ <field>: id, likedBy: req.user._id })
            Look for an existing Like document matching BOTH the resource id
            AND the current user. We need both conditions because:
            - Multiple users can like the same video (same video id, different likedBy)
            - One user can like many videos (same likedBy, different video id)
            Only the pair (video + likedBy) uniquely identifies "user X liked video Y".

   Step 3  If found: findByIdAndDelete()  --> 200 { liked: false }
            If not found: Like.create()   --> 201 { liked: true }

   All three toggles are IDENTICAL in structure -- only the field name changes:
     toggleVideoLike   --> { video:   videoId,   likedBy }
     toggleCommentLike --> { comment: commentId, likedBy }
     toggleTweetLike   --> { tweet:   tweetId,   likedBy }

   getLikedVideos uses a MongoDB Aggregation Pipeline -- explained in detail below.
   ============================================================================= */


// ---------------------------------------------------------------------------
// 1. TOGGLE VIDEO LIKE
//    Route : POST /api/v1/likes/toggle/v/:videoId
//    Params: videoId  (MongoDB ObjectId string)
//    Auth  : Required  (req.user is set by verifyJWT middleware)
//
//    Response:
//      201 { liked: true  }  --> user just liked the video
//      200 { liked: false }  --> user just unliked the video
// ---------------------------------------------------------------------------
const toggleVideoLike = asyncHandler(async (req, res) => {

    // Extract videoId from the URL parameter  (e.g. /toggle/v/64abc123...)
    const { videoId } = req.params

    // Guard: Validate ObjectId format
    // isValidObjectId checks that the string is a well-formed 24-hex-char ObjectId.
    // Without this, a malformed id like "abc" would cause Mongoose to throw a
    // CastError deep inside findOne(), which is harder to debug and gives a
    // less meaningful error message to the client.
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid video ID")
    }

    // DB Query: Does a like already exist?
    // We query for the unique combination of (video + likedBy).
    // This is the "check" step of the toggle pattern.
    //
    // Why findOne instead of exists()?
    // findOne returns the document so we can grab its _id for deletion.
    // exists() only returns true/false -- we would need a second query for the _id.
    const existingLike = await Like.findOne({
        video: videoId,         // matches the video field in the Like schema
        likedBy: req.user._id,  // req.user is populated by verifyJWT middleware
    })

    // Branch A: Like exists --> DELETE it (user is unliking)
    if (existingLike) {

        // findByIdAndDelete is more efficient than findOneAndDelete({ video, likedBy })
        // because _id is the primary index -- MongoDB finds and deletes in O(log n).
        await Like.findByIdAndDelete(existingLike._id)

        // 200 OK: The action succeeded; the resource moved from liked --> unliked.
        // We do NOT use 204 (No Content) because we want to send { liked: false }
        // so the client knows the new state without doing another GET request.
        return res
            .status(200)
            .json(new ApiResponse(200, { liked: false }, "Video unliked successfully"))
    }

    // Branch B: Like does NOT exist --> CREATE it (user is liking)
    // Like.create() is shorthand for new Like({...}).save()
    // We only store the video ObjectId and the user ObjectId -- not the full documents.
    // MongoDB stores references (ObjectIds), not embedded copies of the linked data.
    await Like.create({
        video: videoId,
        likedBy: req.user._id,
    })

    // 201 Created: A new resource (the Like document) was created in the DB.
    return res
        .status(201)
        .json(new ApiResponse(201, { liked: true }, "Video liked successfully"))
})


// ---------------------------------------------------------------------------
// 2. TOGGLE COMMENT LIKE
//    Route : POST /api/v1/likes/toggle/c/:commentId
//    Params: commentId  (MongoDB ObjectId string)
//    Auth  : Required
//
//    Identical pattern to toggleVideoLike.
//    Only change: field name "video" --> "comment"
// ---------------------------------------------------------------------------
const toggleCommentLike = asyncHandler(async (req, res) => {

    const { commentId } = req.params

    // Validate the ObjectId before touching the database
    if (!isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid comment ID")
    }

    // Check if this user already liked this specific comment
    const existingLike = await Like.findOne({
        comment: commentId,    // only difference from toggleVideoLike
        likedBy: req.user._id,
    })

    if (existingLike) {
        // Like found --> remove it (unlike the comment)
        await Like.findByIdAndDelete(existingLike._id)

        return res
            .status(200)
            .json(new ApiResponse(200, { liked: false }, "Comment unliked successfully"))
    }

    // No like yet --> create one (like the comment)
    await Like.create({
        comment: commentId,    // only difference from toggleVideoLike
        likedBy: req.user._id,
    })

    return res
        .status(201)
        .json(new ApiResponse(201, { liked: true }, "Comment liked successfully"))
})


// ---------------------------------------------------------------------------
// 3. TOGGLE TWEET LIKE
//    Route : POST /api/v1/likes/toggle/t/:tweetId
//    Params: tweetId  (MongoDB ObjectId string)
//    Auth  : Required
//
//    Identical pattern to toggleVideoLike.
//    Only change: field name "video" --> "tweet"
// ---------------------------------------------------------------------------
const toggleTweetLike = asyncHandler(async (req, res) => {

    const { tweetId } = req.params

    // Validate the ObjectId before touching the database
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweet ID")
    }

    // Check if this user already liked this specific tweet
    const existingLike = await Like.findOne({
        tweet: tweetId,        // only difference from toggleVideoLike
        likedBy: req.user._id,
    })

    if (existingLike) {
        // Like found --> remove it (unlike the tweet)
        await Like.findByIdAndDelete(existingLike._id)

        return res
            .status(200)
            .json(new ApiResponse(200, { liked: false }, "Tweet unliked successfully"))
    }

    // No like yet --> create one (like the tweet)
    await Like.create({
        tweet: tweetId,        // only difference from toggleVideoLike
        likedBy: req.user._id,
    })

    return res
        .status(201)
        .json(new ApiResponse(201, { liked: true }, "Tweet liked successfully"))
})


/* =============================================================================
   4. GET LIKED VIDEOS
      Route : GET /api/v1/likes/videos
      Auth  : Required

   WHY AGGREGATION and not a simple Like.find()?
   -----------------------------------------------
   Like.find({ likedBy: req.user._id, video: { $exists: true } })
   ...would only give us the Like documents, which contain just an ObjectId
   reference to a Video -- not the video's title, thumbnail, or owner.

   To get the full video data in a SINGLE database round-trip we use
   MongoDB's Aggregation Pipeline, which lets us:
     - Filter documents  ($match)
     - Join collections  ($lookup  <--  equivalent of SQL JOIN)
     - Flatten arrays    ($unwind)
     - Reshape documents ($project <--  pick / rename fields)
     - Sort the results  ($sort)

   Think of the pipeline as an assembly line:
   each stage receives documents from the previous stage,
   transforms them, and passes them to the next stage.
   ============================================================================= */
const getLikedVideos = asyncHandler(async (req, res) => {

    const likedVideos = await Like.aggregate([

        // STAGE 1: $match
        // -----------------------------------------------------------------------
        // $match is always the FIRST stage whenever possible.
        // It reduces the number of documents flowing through the rest of the
        // pipeline early, so later stages work on a smaller set -- much faster.
        //
        // We filter for Like documents where:
        //   a) likedBy === current user's _id
        //   b) the "video" field actually exists and is not null
        //      (a Like doc could belong to a comment or tweet; we only want videos)
        //
        // IMPORTANT: Inside an aggregation pipeline, Mongoose does NOT
        // auto-cast plain strings to ObjectId. We must do it manually with
        // new mongoose.Types.ObjectId(...).
        {
            $match: {
                likedBy: new mongoose.Types.ObjectId(req.user._id),
                // $exists: true  --> the field must be present in the document
                // $ne: null      --> and its value must not be null
                video: { $exists: true, $ne: null },
            },
        },

        // STAGE 2: $lookup (join videos collection)
        // -----------------------------------------------------------------------
        // $lookup performs a LEFT OUTER JOIN between the current collection
        // (likes) and another collection (videos).
        //
        // How it works:
        //   For each Like document coming from Stage 1, MongoDB goes to the
        //   "videos" collection and finds all documents where
        //   videos._id === like.video (our localField).
        //   The matched video documents are collected into an array and attached
        //   to the Like document under the key "videoDetails".
        //
        // Because each like references exactly ONE video, "videoDetails" will
        // be an array of length 1 (or 0 if the video was deleted).
        // We flatten it in Stage 3.
        {
            $lookup: {
                from: "videos",          // the MongoDB collection name (lowercase, plural)
                localField: "video",     // field in the Like document  (the ObjectId ref)
                foreignField: "_id",     // field in the Video document to match against
                as: "videoDetails",      // name of the new array field added to each Like doc
            },
        },

        // STAGE 3: $unwind (flatten videoDetails)
        // -----------------------------------------------------------------------
        // After $lookup, every Like document now looks like:
        //   { video: ObjectId, likedBy: ObjectId, videoDetails: [ {...videoDoc} ] }
        //
        // $unwind deconstructs that array:
        //   - if the array has 1 element, the document stays (array replaced by the element)
        //   - if the array has 0 elements (video deleted), the document is DROPPED entirely
        //     (this is the default behaviour -- acts like an INNER JOIN)
        //
        // After this stage:
        //   { video: ObjectId, likedBy: ObjectId, videoDetails: { ...videoDoc } }
        {
            $unwind: "$videoDetails",
        },

        // STAGE 4: $match (published filter)
        // -----------------------------------------------------------------------
        // We run a second $match AFTER the lookup so we can filter on fields
        // that only exist after joining (videoDetails.ispublished).
        //
        // Why not do this in Stage 1?
        // Because in Stage 1 we only have the Like document. The "ispublished"
        // field lives on the Video document -- it only becomes available AFTER
        // the $lookup + $unwind in stages 2 & 3.
        //
        // This removes any liked videos that the owner has since un-published.
        {
            $match: {
                "videoDetails.ispublished": true,   // dot-notation to access nested field
            },
        },

        // STAGE 5: $lookup (join users collection for owner info)
        // -----------------------------------------------------------------------
        // Each video has an "owner" field which is an ObjectId pointing to a User.
        // We do a second $lookup to join the "users" collection and fetch the
        // owner's public profile (username, fullName, avatar).
        //
        // localField  : "videoDetails.owner"  <-- nested field (dot-notation works here)
        // foreignField: "_id"                 <-- matches _id in the users collection
        // as          : "ownerDetails"        <-- attached as a new array field
        {
            $lookup: {
                from: "users",
                localField: "videoDetails.owner",
                foreignField: "_id",
                as: "ownerDetails",
            },
        },

        // STAGE 6: $unwind (flatten ownerDetails)
        // -----------------------------------------------------------------------
        // Same reasoning as Stage 3: flatten the single-element array produced
        // by the $lookup so we can reference ownerDetails.username directly
        // in the $project stage instead of ownerDetails[0].username.
        {
            $unwind: "$ownerDetails",
        },

        // STAGE 7: $project (shape the output)
        // -----------------------------------------------------------------------
        // $project shapes the final output document for each result.
        // Think of it as SELECT in SQL -- you pick which fields to include/exclude
        // and can rename or compute new fields.
        //
        // Rules:
        //   field: 1         --> include this field
        //   field: 0         --> exclude this field
        //   field: "$path"   --> set the field's value to the value at $path
        //
        // We completely flatten the nested structure here so the client gets a
        // clean, flat video object (not a Like object with nested video/owner).
        {
            $project: {
                // Expose the VIDEO's _id as the document _id (not the Like's _id)
                _id: "$videoDetails._id",

                // Core video metadata
                title:       "$videoDetails.title",
                description: "$videoDetails.description",
                thumbnail:   "$videoDetails.thumbnail",
                videoFile:   "$videoDetails.videoFile",
                duration:    "$videoDetails.duration",   // in seconds (from Cloudinary)
                views:       "$videoDetails.views",
                createdAt:   "$videoDetails.createdAt",  // when the video was published

                // Extra field unique to this endpoint:
                // "$createdAt" refers to the LIKE document's createdAt,
                // i.e. the moment the user pressed the like button on this video.
                // Renamed to "likedAt" to distinguish it from the video's own createdAt.
                likedAt: "$createdAt",

                // Nested owner object -- only public-safe fields (no password, refreshToken etc.)
                owner: {
                    _id:      "$ownerDetails._id",
                    username: "$ownerDetails.username",
                    fullName: "$ownerDetails.fullName",
                    avatar:   "$ownerDetails.avatar",
                },
            },
        },

        // STAGE 8: $sort (newest likes first)
        // -----------------------------------------------------------------------
        // Sort the results so the most recently liked video appears first.
        // -1 = descending (newest first)
        //  1 = ascending  (oldest first)
        //
        // We sort by "likedAt" (the Like document's createdAt) NOT by the
        // video's createdAt, because the user cares about WHEN they liked it,
        // not when the video was originally uploaded.
        {
            $sort: { likedAt: -1 },
        },
    ])
    // Like.aggregate() returns a plain JavaScript array (not a Mongoose document array).
    // This means Mongoose magic (virtuals, methods) is NOT available on these objects.
    // That is perfectly fine here -- we only need the raw data.

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                {
                    likedVideos,                 // the array of shaped video objects
                    total: likedVideos.length,   // convenience count for the client
                },
                "Liked videos fetched successfully"
            )
        )
})

export {
    toggleCommentLike,
    toggleTweetLike,
    toggleVideoLike,
    getLikedVideos,
}
