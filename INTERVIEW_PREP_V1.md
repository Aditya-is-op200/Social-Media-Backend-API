# Social Media Backend API: Interview Preparation Guide (v1.0.0)

This document is a complete interview-preparation guide for the v1 backend of the Social Media Backend API. It is based on the implementation in this repository, not an imagined architecture. Use it to explain the project in a resume interview, a live code walkthrough, or a technical discussion.

## 1. Project In One Minute

> I built a backend-only social media API inspired by YouTube and Twitter. It supports user authentication, media uploads, video publishing, tweets, comments, likes, playlists, subscriptions, watch history, and creator dashboard analytics. The stack is Node.js, Express, MongoDB with Mongoose, JWT authentication, Multer for temporary file handling, and Cloudinary for permanent media storage. The code is organized by routes, controllers, models, middleware, and shared utilities. I used MongoDB aggregation pipelines for data-heavy read endpoints such as channel profiles, comments, liked videos, subscriptions, playlists, and dashboard statistics.

It is intentionally backend-only: a frontend, mobile client, Postman collection, or any HTTP client can consume it.

## 2. Project Goals and Scope

### What v1 delivers

| Area | What the backend provides |
| --- | --- |
| Accounts | Registration, login, logout, refresh-token flow, password change, profile updates, avatar and cover-image updates |
| Authentication | Access and refresh JWTs, HTTP-only cookies, Authorization header support, protected-route middleware |
| Media | Avatar, cover-image, video, and thumbnail uploads through Multer and Cloudinary |
| Video platform | Publish, list, search, sort, paginate, view, update, delete, and publish/unpublish videos |
| Social feed | Create, list, update, and delete text tweets |
| Engagement | Add, list, update, and delete video comments; toggle likes on videos, comments, and tweets |
| Collections | Create and manage playlists; add and remove playlist videos |
| Channels | Subscribe/unsubscribe, list subscribers and subscribed channels, fetch channel profile |
| Creator tools | Dashboard totals for subscribers, videos, views, likes, and channel video list |
| Operations | Healthcheck endpoint, consistent API response objects, and centralized error serialization |

### Deliberate v1 boundaries

- No frontend is included.
- There is no automated test suite yet.
- There is no OpenAPI/Swagger document or generated API client yet.
- The API does not currently include notifications, recommendations, full-text search, messaging, roles, moderation, or payment features.

Those are not hidden omissions. They are sensible next milestones after establishing the core social-media domain.

## 3. Technology Choices

| Technology | Why it is used in this project |
| --- | --- |
| Node.js | Non-blocking JavaScript runtime suited to HTTP APIs and I/O-heavy workloads such as uploads and database calls |
| Express 5 | Lightweight routing, middleware composition, request parsing, and error handling |
| MongoDB | Flexible document storage that maps well to social objects and ObjectId references |
| Mongoose | Schemas, validation, model methods, middleware hooks, aggregation access, and ObjectId helpers |
| JWT | Stateless short-lived access tokens plus longer-lived refresh tokens for session continuity |
| bcrypt | Password hashing and password comparison; plaintext passwords are never stored |
| Multer | Parses `multipart/form-data` and stores uploads temporarily on disk |
| Cloudinary | Durable, CDN-backed media storage; videos and images are not kept in the app repository or MongoDB |
| cookie-parser | Reads access and refresh JWT cookies from incoming requests |
| CORS | Allows a browser client from the configured origin to send credentialed requests |
| mongoose-aggregate-paginate-v2 | Adds pagination metadata to aggregation-based video and comment listings |
| Nodemon | Restarts the development server when source files change |

## 4. Repository Layout

```text
.
├── assets/
│   └── Project_Model.png       # visual data-model diagram
├── public/temp/                # short-lived Multer upload area
├── src/
│   ├── controllers/            # feature-specific business logic
│   ├── db/                     # MongoDB connection
│   ├── middlewares/            # JWT and Multer middleware
│   ├── models/                 # Mongoose schemas and model methods
│   ├── routes/                 # HTTP route declarations
│   ├── utils/                  # errors, responses, async wrapper, Cloudinary
│   ├── app.js                  # Express configuration and route mounting
│   ├── constants.js            # database name
│   └── index.js                # environment loading, database connect, server start
├── README.md
├── INTERVIEW_PREP_V1.md
└── package.json
```

### Why this structure is useful

It separates responsibilities:

- A **route** answers: which HTTP method and URL call this feature?
- Middleware answers: can the request proceed, and do uploaded files need parsing first?
- A **controller** contains request validation, authorization, business logic, and response construction.
- A **model** defines persistent data and reusable document behavior.
- A **utility** contains shared cross-cutting logic rather than repeating it in controllers.

That separation makes a feature easier to test, change, and explain.

## 5. Startup and Request Lifecycle

```text
src/index.js
  -> loads .env
  -> connects to MongoDB
  -> starts Express on PORT or 8000

Incoming request
  -> app-level middleware: CORS, JSON/urlencoded parsing, static files, cookies
  -> matching router mounted below /api/v1
  -> verifyJWT and/or Multer when the route requires it
  -> controller
  -> Mongoose / Cloudinary operations
  -> ApiResponse JSON, or asyncHandler -> global error middleware -> error JSON
```

### Example: publish a video

```text
POST /api/v1/videos
  -> verifyJWT reads accessToken and attaches req.user
  -> upload.fields stores videoFile + thumbnail briefly in public/temp
  -> publishAVideo validates title, description, and both local paths
  -> Cloudinary uploads the two files and deletes their local temp files
  -> Video document is created with URLs, duration, and authenticated owner ID
  -> 201 ApiResponse is sent to the client
```

## 6. Data Model Walkthrough

The project favors references between collections rather than embedding large copies of related data. That keeps user details, videos, and interactions independently manageable.

### User

Important fields:

- `username`: unique, lowercased, trimmed, 3-30 characters, indexed.
- `email`: unique, lowercased, trimmed.
- `fullName`: trimmed, 3-100 characters, indexed.
- `avatar` and `coverImage`: Cloudinary URL strings.
- `password`: bcrypt hash, never intentionally returned in API responses.
- `refreshToken`: current refresh token for the user.
- `watchHistory`: array of referenced `Video` ObjectIds.
- `createdAt` and `updatedAt`: supplied by Mongoose timestamps.

Important model behavior:

- A Mongoose `pre("save")` hook hashes the password with bcrypt only when `password` changed.
- `isPasswordCorrect()` compares submitted password text to the stored bcrypt hash.
- `generateAccessToken()` signs identity claims with the access-token secret and expiry.
- `generateRefreshToken()` signs a smaller payload containing only the user ID.

### Video

- Media fields: `videoFile`, `thumbnail`, and Cloudinary-provided `duration`.
- Metadata: `title`, `description`, `views`, and `ispublished`.
- Ownership: `owner` references `User`.
- The aggregate-pagination plugin is attached to this model.

### Tweet

- `content` is the text post.
- `owner` references the authoring user.
- Timestamps enable newest-first lists.

### Comment

- `content` is the comment text.
- `video` references the video being discussed.
- `owner` references the author.
- The aggregate-pagination plugin is attached to support pageable comment lists.

### Like

One Like document represents one user liking one target. Depending on the interaction, one of `video`, `comment`, or `tweet` is set, together with `likedBy`.

### Playlist

- `name` and `description` identify the collection.
- `owner` references the user who controls it.
- `videos` is an ordered array of referenced video IDs.

### Subscription

This is a relationship between two users:

- `subscriber`: the user following another channel.
- `channel`: the user/channel being followed.

It is a classic many-to-many relationship stored as its own collection.

## 7. Authentication and Authorization

### Login flow

1. The client sends `username` or `email` and `password` to `POST /api/v1/users/login`.
2. The controller finds the user and compares the supplied password using bcrypt.
3. It creates a short-lived access token and a longer-lived refresh token.
4. The refresh token is persisted on that user document. This enables logout and refresh-token invalidation.
5. Both tokens are sent as HTTP-only, secure cookies and are also included in the response data for clients that use bearer tokens.

### Protected-request flow

1. `verifyJWT` reads the token from `accessToken` cookie or `Authorization: Bearer <token>`.
2. It verifies the token using `ACCESS_TOKEN_SECRET`.
3. It loads the user while excluding `password` and `refreshToken`.
4. It attaches the sanitized user to `req.user`.
5. The controller uses `req.user._id` for ownership checks and creates data on behalf of the authenticated user.

### Refresh flow

1. Client sends the refresh token from a cookie or request body to `POST /api/v1/users/refresh-token`.
2. Server verifies its signature with `REFRESH_TOKEN_SECRET`.
3. Server finds the user and checks that the incoming token matches the stored token.
4. Server issues and stores a replacement access/refresh pair. This rotates the refresh token.

### Logout flow

Logout unsets the stored refresh token and clears both cookies. A previously issued access token remains usable until it expires because access tokens are stateless; this is a normal JWT tradeoff. A high-security version can add an access-token denylist or use very short access-token lifetimes.

### Authorization pattern

Authentication means knowing **who** made the request. Authorization means checking whether that user is allowed to act on a resource.

For mutable resources, the controller compares object IDs:

```js
if (resource.owner.toString() !== req.user._id.toString()) {
  throw new ApiError(403, "You are not authorized")
}
```

This is used for videos, tweets, comments, and playlists. ObjectIds are objects, so direct `===` comparison is unreliable; string values are compared instead.

## 8. Media Upload and Cleanup Design

The project uses a two-step upload path:

1. Multer writes the submitted file to `public/temp` with a unique generated filename.
2. `uploadOnCloudinary()` uploads it with `resource_type: "auto"` to the `social-media-backend` Cloudinary folder.
3. The local temporary file is removed after a successful upload. The failure path also tries to remove the temporary file.
4. The database stores the hosted Cloudinary URL rather than binary content.

### Supported multipart field names

| Endpoint | Field names |
| --- | --- |
| `POST /users/register` | `avatar` required, `coverImage` optional |
| `PATCH /users/avatar` | `avatar` |
| `PATCH /users/cover-image` | `coverImage` |
| `POST /videos` | `videoFile` and `thumbnail` |
| `PATCH /videos/:videoId` | optional `thumbnail` |

### Why Cloudinary instead of MongoDB file storage?

- Database backups stay smaller and quicker.
- Media delivery benefits from a CDN.
- Transformations, metadata such as video duration, and lifecycle operations are handled by a dedicated media platform.
- App servers remain easier to scale because they do not need to serve large media files themselves.

## 9. API Reference for Interview Discussion

Base URL: `/api/v1`

All successful responses use this general shape:

```json
{
  "statusCode": 200,
  "data": {},
  "message": "Descriptive success message",
  "success": true
}
```

Errors use the global error middleware shape:

```json
{
  "statusCode": 400,
  "success": false,
  "message": "Reason for failure",
  "errors": []
}
```

### Healthcheck

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/healthcheck` | No | Returns application status, uptime, timestamp, environment, and Node version |

### User endpoints

| Method | Path | Auth | Key behavior |
| --- | --- | --- | --- |
| `POST` | `/users/register` | No | Creates user after required-field, duplicate-user, and avatar checks |
| `POST` | `/users/login` | No | Authenticates by email or username and issues token pair |
| `POST` | `/users/logout` | Yes | Removes persisted refresh token and clears cookies |
| `POST` | `/users/refresh-token` | Refresh token | Validates and rotates a token pair |
| `POST` | `/users/change-password` | Yes | Verifies old password, then saves new password through bcrypt hook |
| `GET` | `/users/current-user` | Yes | Returns the sanitized authenticated user |
| `PATCH` | `/users/update-account` | Yes | Updates full name and email |
| `PATCH` | `/users/avatar` | Yes | Uploads replacement avatar and attempts deletion of the old hosted asset |
| `PATCH` | `/users/cover-image` | Yes | Uploads replacement cover image and attempts deletion of the old hosted asset |
| `GET` | `/users/c/:username` | Yes | Aggregates profile, subscriber count, subscribed-channel count, and requester subscription state |
| `GET` | `/users/history` | Yes | Aggregates watched videos with public owner details |

### Video endpoints

| Method | Path | Auth | Key behavior |
| --- | --- | --- | --- |
| `GET` | `/videos?page=&limit=&query=&sortBy=&sortType=&userId=` | Yes | Returns published videos with search, owner join, sort, and pagination |
| `POST` | `/videos` | Yes | Uploads video and thumbnail, then creates a video document |
| `GET` | `/videos/:videoId` | Yes | Increments views, returns published video with owner profile, adds to watch history |
| `PATCH` | `/videos/:videoId` | Yes, owner | Updates title/description and optionally replaces thumbnail |
| `DELETE` | `/videos/:videoId` | Yes, owner | Deletes hosted video/thumbnail then deletes MongoDB document |
| `PATCH` | `/videos/toggle/publish/:videoId` | Yes, owner | Flips `ispublished` |

### Tweet, comment, and like endpoints

| Feature | Routes | What to say about it |
| --- | --- | --- |
| Tweets | `POST /tweets`, `GET /tweets/user/:userId`, `PATCH|DELETE /tweets/:tweetId` | CRUD with owner-only mutation. Listing enriches author data and exposes `likesCount` and current-user `isLiked`. |
| Comments | `GET|POST /comments/:videoId`, `PATCH|DELETE /comments/c/:commentId` | Pageable video comments with author profile, likes count, and current-user interaction state. Delete also removes comment likes. |
| Likes | `POST /likes/toggle/v/:videoId`, `/c/:commentId`, `/t/:tweetId`; `GET /likes/videos` | Toggle semantics: create when absent, delete when present. Liked video list uses aggregation to return real video and owner data. |

### Playlist, subscription, and dashboard endpoints

| Feature | Routes | What to say about it |
| --- | --- | --- |
| Playlists | Create, fetch, update, delete; add/remove video; list a user’s playlists | Owner-only mutations; duplicate video insertion is rejected; reads use aggregation for video previews and populated detail. |
| Subscriptions | Get channel subscribers; toggle a subscription; get a user’s subscribed channels | Prevents self-subscription; aggregation enriches user/channel data and latest video preview. |
| Dashboard | `GET /dashboard/stats`, `GET /dashboard/videos` | Computes creator totals and channel video details with likes counts. Stats queries are run concurrently with `Promise.all`. |

## 10. Aggregation Pipelines: The Most Important Technical Topic

MongoDB aggregation is used where a simple `find()` would return only references or require repeated database calls. Think of a pipeline as a server-side data-processing sequence.

### Common stages in this project

| Stage | Meaning | Example use |
| --- | --- | --- |
| `$match` | Filters documents early | Only published videos; comments for one video |
| `$lookup` | Joins another collection, similar to a SQL left join | Video owner, likes, subscribers, playlist videos |
| `$addFields` | Adds computed fields | `likesCount`, `isLiked`, `totalVideos` |
| `$project` | Chooses/reshapes response fields | Excludes sensitive user fields and raw likes arrays |
| `$unwind` | Converts a one-item lookup array into an object | Liked video and owner details |
| `$group` | Produces summary totals | Channel dashboard views, likes, and videos |
| `$sort` | Sorts results | Newest tweets, comments, subscriptions, playlists |
| `$count` | Counts matching documents | Total channel subscribers |

### Example: comment list

The comment-list endpoint starts by matching the requested video, joins each comment owner’s public fields, joins likes, calculates `likesCount`, calculates whether the requester liked it, removes the raw likes array, sorts newest-first, and passes the pipeline to `aggregatePaginate`.

This is better than doing one query for comments and a separate query for every owner and every like count. That avoided pattern is commonly called the N+1 query problem.

### Example: channel dashboard

`getChannelStats` runs two independent aggregations with `Promise.all`:

- subscription count where the current user is `channel`;
- video aggregate that joins video likes and groups total videos, views, and likes.

Running independent database work concurrently reduces endpoint latency compared with awaiting each query sequentially.

## 11. Validation, Error Handling, and HTTP Semantics

### Validation currently performed

- Required text is trimmed so whitespace-only input is rejected.
- MongoDB IDs are checked with `isValidObjectId` before database work in most resource operations.
- User registration checks duplicate email/username.
- Resource existence is checked before dependent operations such as commenting or adding to a playlist.
- Ownership is checked before updates or deletes.
- Playlist insertion checks for duplicate videos.
- A user cannot subscribe to their own channel.

### Shared error flow

Controllers are wrapped by `asyncHandler`. A rejected Promise is forwarded to Express’s global error middleware rather than becoming an unhandled async error. `ApiError` carries status code, message, and optional errors. The global handler serializes errors consistently.

### Status-code reasoning

| Status | Meaning in this API |
| --- | --- |
| `200 OK` | Successful read, update, delete, logout, or unlike action |
| `201 Created` | Registration, video, tweet, comment, playlist, like, or subscribe action created a document |
| `400 Bad Request` | Missing/invalid input or invalid ObjectId format |
| `401 Unauthorized` | Missing, invalid, or expired token; invalid credentials |
| `403 Forbidden` | Authenticated user is not the owner of a protected resource |
| `404 Not Found` | Requested user, video, tweet, comment, playlist, or channel does not exist |
| `409 Conflict` | Duplicate username or email during registration |
| `500 Internal Server Error` | Unexpected server failure, including unsuccessful media upload paths |

## 12. Key Design Decisions and How To Defend Them

### Why access and refresh tokens?

Access tokens are short-lived credentials used on protected API calls. Refresh tokens allow session renewal without asking users to log in frequently. Storing the current refresh token on the user allows logout and token rotation: a token that no longer matches the stored value is rejected.

### Why return tokens in both cookies and response data?

Cookies support browser sessions, while the response body is useful for API clients such as mobile applications or Postman. In a stricter browser-only design, I would avoid returning refresh tokens in JSON and use secure cookie-only handling.

### Why use `httpOnly` cookies?

JavaScript in the browser cannot read an HTTP-only cookie, which limits token theft through many XSS attacks. This does not eliminate all security concerns: credentialed cookies still require appropriate CORS and CSRF strategy.

### Why separate likes into their own collection?

A Like is a relationship with its own creator and timestamp. A separate collection supports querying “what did this user like?”, counting likes, and attaching the same interaction pattern to videos, comments, and tweets without duplicating large arrays in each document.

### Why store references rather than embed all related documents?

Users, videos, comments, likes, and subscriptions change independently and can grow heavily. References avoid copying user details into every post. Aggregation pipelines materialize the client-friendly view only when it is needed.

### Why calculate counts instead of storing denormalized counters?

The implementation calculates many counts through aggregation, reducing the risk of counters becoming inconsistent. At larger scale, selective denormalized counters can improve read performance, but then writes must update those counters atomically and repair drift.

## 13. Likely Interview Questions With Strong Answers

### Architecture

**Q: Explain the project architecture.**

**A:** Express routes map HTTP requests to controllers. Middleware handles shared concerns such as JWT verification and multipart parsing. Controllers validate inputs, authorize users, invoke Mongoose models and Cloudinary helpers, then return a standard response. Models define MongoDB schemas and user-specific behavior such as hashing and token generation. Shared utilities keep error handling and cloud uploads consistent.

**Q: Why did you choose MVC-style separation?**

**A:** It keeps transport logic, domain logic, persistence logic, and shared infrastructure separate. For example, the video route only declares URL, middleware, and controller; the controller owns validation and authorization; the Video model owns data shape; Cloudinary code is reusable infrastructure. That limits duplication and makes later testing cleaner.

**Q: Is this a monolith? Is that bad?**

**A:** It is a modular monolith: one deployable backend with feature modules. For v1 that is appropriate because it is simpler to build, debug, and deploy. The boundaries already point toward future services if scale requires it, especially media processing, notifications, search, and analytics.

### Authentication and security

**Q: How are passwords protected?**

**A:** The User schema uses a pre-save hook. When the password field changes, it hashes the value with bcrypt using 10 salt rounds. Login uses bcrypt comparison, so the original password is never retrieved or stored.

**Q: Why use a pre-save hook?**

**A:** It centralizes hashing near the data model. Controllers can assign a new password normally and call `save`; the hook guarantees hashing whenever the password changes, avoiding repeated or forgotten controller-level hashing.

**Q: How do you protect routes?**

**A:** `verifyJWT` reads an access token from a cookie or Bearer header, verifies its signature, fetches the user without password or refresh token, places that user on `req.user`, and allows the request to continue. Protected routers apply it before their controller handlers.

**Q: How does refresh-token rotation work?**

**A:** A refresh request must contain a valid signed token that exactly matches the token currently stored on the user. The server then generates and stores a replacement pair. Reusing an old refresh token fails because it no longer matches the persisted value.

**Q: How would you improve refresh-token security?**

**A:** Store a hash of refresh tokens rather than the raw token, track per-device sessions instead of one token per user, set `sameSite` based on frontend deployment, avoid returning refresh tokens in JSON for browser clients, and add reuse detection plus session revocation metadata.

**Q: What is the difference between 401 and 403 here?**

**A:** `401` means the request lacks valid authentication. `403` means a valid authenticated user exists but does not own or have permission for the target resource.

### MongoDB and Mongoose

**Q: Why use MongoDB?**

**A:** The domain contains social objects with evolving fields and many relationship reads. MongoDB provides flexible documents and a powerful aggregation framework. Mongoose adds schema validation, hooks, model methods, and ObjectId handling.

**Q: What is an ObjectId and why do you validate it?**

**A:** It is MongoDB’s standard document identifier type. Validating route parameters with `isValidObjectId` catches malformed input early and produces clearer 400 responses instead of Mongoose CastErrors.

**Q: Why do aggregation pipelines explicitly construct `new mongoose.Types.ObjectId()`?**

**A:** In ordinary Mongoose queries, strings are often cast automatically. Aggregation pipelines operate closer to MongoDB and do not reliably auto-cast plain strings, so the code converts values explicitly before `$match`, `$in`, or `$lookup` comparisons.

**Q: What is `$lookup`?**

**A:** It joins data from another collection. For example, a Video stores only its owner ID. `$lookup` fetches the owner’s public profile so the client can render a video card without multiple API calls.

**Q: What is the N+1 problem and where does this project avoid it?**

**A:** It occurs when a list query is followed by an additional query for each item, such as one user lookup per comment. Aggregation joins owners and likes in the database so comments, tweets, playlist details, and liked videos arrive in a small number of database operations.

**Q: How is pagination implemented?**

**A:** Video and comment models register `mongoose-aggregate-paginate-v2`. The controller builds the aggregation pipeline and passes `page` and `limit`; the plugin applies pagination and returns metadata such as documents, page, total documents, and total pages.

### File handling

**Q: Walk through a video upload.**

**A:** The request is authenticated first. Multer parses `multipart/form-data` and writes video and thumbnail into a temporary directory. The controller validates fields, uploads both files to Cloudinary, receives secure URLs and duration metadata, removes temp files through the upload helper, creates the Video document, and returns 201.

**Q: Why not send a file directly to Cloudinary from the browser?**

**A:** Direct signed uploads can reduce load on the API and are a good scaling step. This v1 design routes uploads through the backend so the server controls validation and persistence in one place. At higher scale I would issue signed upload parameters or use direct uploads with a server-side confirmation step.

### Feature behavior

**Q: How do likes work?**

**A:** They use a toggle pattern. The handler searches for a Like matching both the target ID and current user. If found, it deletes that document and returns `liked: false`; otherwise it creates one and returns `liked: true`.

**Q: How do you prevent one user from editing another user’s content?**

**A:** After authentication, the controller loads the resource and compares its owner ID with `req.user._id`. A mismatch produces a 403 error before any mutation happens.

**Q: How are comments enriched with likes and author data?**

**A:** The comment aggregation joins the owner from `users`, joins related `likes`, calculates number of likes with `$size`, and determines whether the current requester’s ID is in `likes.likedBy`.

**Q: How is a video view counted safely?**

**A:** The controller uses MongoDB’s `$inc` update operator. It is atomic at the document level, so concurrent requests do not overwrite one another’s increments.

**Q: What does `watchHistory` do?**

**A:** When a protected video-details request succeeds, the video ID is added with `$addToSet`, so the same video is not duplicated. A separate aggregation joins watched videos with their owner’s public details.

**Q: Why use a separate Subscription collection?**

**A:** It models a many-to-many user-to-user relationship cleanly, supports both “who follows this channel?” and “which channels does this user follow?” queries, and preserves creation time for newest-first ordering.

### Deployment and operations

**Q: What environment variables does it require?**

**A:** MongoDB URI, access-token secret/expiry, refresh-token secret/expiry, Cloudinary cloud name/API key/API secret, CORS origin, optional port, and optional `NODE_ENV`. Secrets stay in `.env` and must never be committed.

**Q: How would you deploy it?**

**A:** Configure environment variables in the host, use a managed MongoDB deployment such as Atlas, configure Cloudinary credentials, set exact CORS origin(s), run the Node server behind HTTPS/reverse proxy, add a production `start` script, and use `/api/v1/healthcheck` for health monitoring. I would also add structured logging, rate limiting, tests, and CI before calling it production-ready.

## 14. Improvements To Mention Honestly

Good interview answers do not pretend a v1 has no tradeoffs. Mention the issue, why it matters, and the concrete next action.

| Current v1 limitation | Why it matters | Next improvement |
| --- | --- | --- |
| No automated tests or test script | Regressions are harder to catch | Add Jest/Vitest plus Supertest, MongoDB test environment, Cloudinary mocks, and route-level integration tests |
| No rate limiting | Login and write endpoints can be abused | Add `express-rate-limit`, with stricter limits for login and refresh routes |
| No request-security middleware | Missing common HTTP hardening | Add Helmet, input sanitization, request size/file-size limits, and centralized validation schemas |
| Multer has no explicit MIME type or size limits | A client can upload an inappropriate or excessively large file | Add file filters, size limits, and content inspection strategy |
| Like/Subscription schemas have no compound uniqueness constraints | Concurrent toggles can create duplicates | Add unique compound indexes, such as `{ video: 1, likedBy: 1 }`, and handle duplicate-key errors |
| Like handlers validate the ID format but do not verify target existence | Likes can theoretically reference a missing target | Verify target existence or enforce it with a transaction/service-level invariant |
| Deleting a video does not clean all related comments, likes, playlist entries, or watch histories | Referenced orphan records can remain | Use a transaction or background cleanup/cascade strategy; update dependent documents |
| Cloudinary deletion derives a public ID from URL and uses default destroy settings | Video and transformed asset deletion needs more robust metadata | Persist Cloudinary `public_id` and `resource_type` with each upload; delete using those values |
| Video view increment happens before confirming published-video availability | Invalid/unpublished requests can affect the count | Fetch and authorize published video first, then increment only for a valid view policy |
| `sortBy` is client-provided without a whitelist | Clients can request inefficient or unintended sort fields | Whitelist allowed fields such as `createdAt`, `views`, and `duration` |
| Secure cookies are always enabled | Plain HTTP local development will not send them | Make cookie `secure` environment-aware and set a considered `sameSite` policy |
| One refresh token field means one active browser/device session per user | Logging in elsewhere replaces the prior refresh token | Store session records keyed by device/session ID |
| No production `start` script | Deployment platforms commonly expect it | Add `"start": "node src/index.js"` |
| Database URI appends `/videotube` | A URI already containing a database name can be awkward | Supply the database cleanly through config or `dbName` option |
| No API specification | Manual integration is slower | Add OpenAPI/Swagger and a checked-in Postman collection |

## 15. Testing Strategy You Can Propose

### Unit tests

- `ApiError`, `ApiResponse`, and `asyncHandler` behavior.
- User password hash hook and password comparison.
- JWT model methods with controlled secrets.
- Cloudinary helper behavior with mocked uploader and filesystem operations.

### Integration tests

- Register succeeds with avatar and rejects duplicate email/username.
- Login rejects wrong password and issues tokens for valid credentials.
- A request without token gets 401 from protected routes.
- A non-owner gets 403 when updating/deleting video, tweet, comment, or playlist.
- Video listing honors pagination, search, user filter, and allowed sort values.
- Like toggle returns `true` then `false` for the same authenticated user and target.
- Comment/tweet deletion removes dependent like records.
- Subscription rejects self-subscription and toggles predictably.
- Dashboard totals match seeded documents.

### End-to-end/manual test path

1. Register two users with multipart avatars.
2. Log in as user A and keep the access token/cookies.
3. Upload a video as user A.
4. Log in as user B, open the video, comment, like it, and subscribe to user A.
5. Confirm user A’s dashboard and channel profile reflect the interaction.
6. Confirm user B’s liked-videos list, subscribed channels, and watch history contain expected items.
7. Verify ownership failures by attempting to edit user A’s content while authenticated as user B.

## 16. Performance and Scalability Discussion

### What is already good in v1

- Aggregations avoid several N+1 read patterns.
- Pagination is present for potentially large video and comment lists.
- User-facing owner fields are projected rather than returning full user documents.
- Media is handled by Cloudinary instead of the API server serving large files.
- Dashboard’s independent queries run in parallel.
- View count uses atomic `$inc`.

### What changes at larger scale

- Add indexes for lookup and filtering paths: `Video.owner`, `Video.ispublished`, `Comment.video`, `Like.likedBy`, each Like target field, and subscription `{ channel, subscriber }` pairs.
- Add unique compound indexes to enforce interaction invariants under concurrency.
- Replace regex-only title search with a MongoDB text index or dedicated search engine when needed.
- Use cursor pagination for very large, rapidly changing feeds.
- Cache popular/public read endpoints and dashboard summaries where freshness requirements permit.
- Make upload processing asynchronous: direct uploads or a queue for transcoding, thumbnails, and moderation.
- Consider event-driven counters/analytics for high write volume rather than aggregating everything on demand.
- Split modules only when operational boundaries require it; do not prematurely create distributed services.

## 17. Security Checklist for a Production v2

- Use strong, distinct, rotated secrets and never expose `.env` values.
- Enforce HTTPS and configure cookie `secure`, `httpOnly`, and `sameSite` correctly for deployment.
- Keep CORS origins explicit; do not use permissive credentials with wildcard origins.
- Add rate limits to authentication and mutation endpoints.
- Add Helmet and a content-security policy appropriate for API/static-file use.
- Validate bodies, params, and query strings with a schema validator such as Zod, Joi, or express-validator.
- Add upload size limits and file-type validation.
- Persist Cloudinary public IDs and delete media with correct resource types.
- Hash refresh tokens in storage and maintain per-device sessions.
- Add CSRF protection if cookies are the browser authentication mechanism.
- Do not leak internal stack traces or sensitive errors to clients.
- Add audit logging and monitoring for authentication failures and destructive actions.
- Use MongoDB transactions or robust asynchronous cleanup around multi-document deletion workflows.

## 18. A Five-Minute Demo Script

1. Start with `/api/v1/healthcheck` to show the service and environment metadata.
2. Register a user with an avatar using multipart form data. Explain that Multer stages the file and Cloudinary persists it.
3. Log in and point out the access/refresh token lifecycle.
4. Upload a video and thumbnail. Explain ownership and Cloudinary duration metadata.
5. List videos with `?query=&sortBy=views&sortType=desc&page=1&limit=10` to show filtering, joining, and pagination.
6. Open a video to show atomic views and watch-history update.
7. Add a comment and a like from another account. Fetch comments to show `likesCount`, `isLiked`, and public author details.
8. Subscribe to the channel and open `/dashboard/stats` to show derived analytics.
9. Attempt an owner-only edit from the wrong account to demonstrate 403 authorization.
10. Close by naming the next v2 milestones: tests, validation/security hardening, unique indexes, API spec, and deployment automation.

## 19. Resume and Portfolio Wording

### One-line project description

Built a Node.js and Express social-media backend with JWT authentication, Cloudinary media uploads, MongoDB aggregations, video/tweet/comment/like workflows, playlists, subscriptions, and creator analytics.

### Resume bullets

- Designed and implemented a backend-only social media REST API using Node.js, Express, MongoDB, and Mongoose, covering accounts, videos, tweets, comments, likes, playlists, subscriptions, and dashboards.
- Implemented JWT access/refresh-token authentication with bcrypt password hashing, protected-route middleware, refresh-token rotation, and resource ownership authorization.
- Built a Multer-to-Cloudinary media pipeline for avatars, cover images, videos, and thumbnails, including temporary-file cleanup and hosted-asset replacement flows.
- Wrote MongoDB aggregation pipelines for pageable content feeds, interaction state, channel profiles, subscription views, liked videos, and creator statistics while projecting only public user fields.

## 20. Final Checklist Before an Interview

- Run the project locally once with valid MongoDB and Cloudinary environment variables.
- Know the difference between authentication and authorization.
- Be able to explain access token, refresh token, and bcrypt without reading notes.
- Practice the one-minute project explanation aloud.
- Know one aggregation pipeline deeply: comments, liked videos, or dashboard stats.
- Be ready to explain why `$lookup`, `$project`, `$addFields`, and `$group` are used.
- Know the media-upload path from multipart request to Cloudinary URL in MongoDB.
- Be ready to show one ownership check and explain why ObjectIds are converted to strings.
- Do not claim v1 is production-hardened; explain the concrete v2 improvements listed above.
- If asked about something not implemented, say what you would build next and why.

## 21. Quick Glossary

| Term | Meaning in this project |
| --- | --- |
| API | HTTP interface that a frontend/mobile client uses to access backend features |
| Controller | Function that handles a request’s validation, domain logic, and response |
| Middleware | Function run before a controller, such as JWT verification or file parsing |
| JWT | Signed token used to prove identity without server-side access-token session storage |
| Refresh token | Longer-lived credential used to obtain a new access token |
| bcrypt | Password hashing algorithm designed to be intentionally slow against brute force |
| Mongoose schema | Definition of a MongoDB document’s fields, validation, hooks, and methods |
| Aggregation pipeline | Ordered MongoDB data transformations such as filter, join, calculate, group, and sort |
| `$lookup` | MongoDB join-like aggregation stage |
| `$project` | Aggregation stage that selects or reshapes output fields |
| `$addToSet` | MongoDB update operator that adds an array value only if absent |
| `$inc` | MongoDB update operator that atomically increments a numeric value |
| CDN | Network that serves static media quickly from locations near users |
| Idempotency | Repeating an operation has the same final effect; toggle endpoints are intentionally not fully idempotent because repeated calls alternate state |

---

Version: v1.0.0
Project: Social Media Backend API
Scope: Backend-only interview walkthrough and technical reference
