# Social Media Backend API: Project Story Q&A (v1)

Use this as a quick-reference sheet for the conversational questions interviewers ask after reading the Social Media Backend API project on your resume. The answers are deliberately natural rather than overly formal. Adapt the wording to how you actually speak; do not memorize it word for word.

## 1. The Core Story

### Q: What is this project?

It is a backend-only REST API for a YouTube and Twitter style social media platform. Users can register and log in, upload videos and thumbnails, create tweets and comments, like content, manage playlists, subscribe to channels, view watch history, and access basic creator dashboard statistics. I built it with Node.js, Express, MongoDB, Mongoose, JWT, Multer, and Cloudinary.

### Q: Why did you build this project?

I wanted a project that forced me to work through the core backend problems in one connected domain rather than build isolated CRUD examples. A social media platform naturally needs authentication, authorization, uploads, relationships between users and content, aggregation queries, pagination, and cleanup. It gave me a realistic way to understand how backend features affect one another.

### Q: What problem does it solve?

At the product level, it provides the server-side foundation for a creator and social-content platform. At the learning level, it solves the problem of understanding how a production-style API is structured: how an authenticated user uploads content, how another user interacts with it, how the system returns joined data efficiently, and how owners retain control of their resources.

### Q: Why a YouTube and Twitter hybrid instead of one simple app?

Video platforms and microblogging platforms exercise different backend patterns. Videos add uploads, hosted media, duration, views, watch history, and playlists. Tweets add fast text creation and engagement. Combining them gave me broader but still related backend requirements, all centered on the same User, Like, Comment, and Subscription relationships.

### Q: Why did you make it backend-only?

The goal of this project was to go deep on backend design. A frontend would be useful for a finished product, but it can hide API issues or consume time that I wanted to spend on authentication, data modeling, media handling, authorization, and database queries. The API is ready to be consumed by React, a mobile app, or Postman.

### Q: Who is the intended user?

The intended end user is someone who publishes or consumes social content: creators upload and manage videos, viewers watch, like, comment, subscribe, and save videos to playlists. The immediate technical consumer is any frontend or mobile client that needs those capabilities through HTTP APIs.

### Q: What did you personally build?

I built the API structure, Mongoose models, Express routes, JWT middleware, controllers, aggregation pipelines, Multer-to-Cloudinary upload flow, ownership checks, standardized responses/errors, and the project documentation. The project is organized as a modular MVC-style backend rather than a collection of unrelated route handlers.

### Q: What was your main learning goal?

My main goal was to understand a complete backend request lifecycle: receive a request, authenticate the user, validate data, upload media if needed, update related MongoDB collections, authorize the action, and return a clean response. I especially wanted to get comfortable with MongoDB aggregations instead of relying only on simple CRUD queries.

## 2. Why This Tech Stack?

### Q: Why Node.js and Express?

I chose Node.js because JavaScript lets me use the same language across frontend and backend projects, which fits well with my React and full-stack experience. Express is lightweight and makes middleware-based API design clear: authentication, file uploads, parsing, routes, and error handling can be composed in a predictable order.

### Q: Why MongoDB instead of MySQL?

MongoDB fit the social-content domain well because documents such as users, videos, tweets, and comments can evolve independently, while ObjectId references and aggregations support relationship reads. I also wanted hands-on experience with MongoDB aggregation pipelines. A relational design in MySQL would also be valid, especially when strong relational constraints and transactions are the main concern; this choice was about the project’s learning goals and data-access patterns, not claiming MongoDB is always better.

### Q: Why Mongoose instead of the native MongoDB driver?

Mongoose gives me schemas, validation, timestamps, model methods, hooks, and convenient ObjectId helpers. For example, the User model hashes a password in a pre-save hook and owns token-generation methods. That keeps data behavior close to the model and avoids repeating it in controllers.

### Q: Why JWT instead of server sessions?

JWTs make it convenient for an API to authenticate browser, mobile, and API-tool clients without storing every access-token session on the server. I use short-lived access tokens for protected requests and longer-lived refresh tokens to renew sessions. For a more security-sensitive system, I would keep per-device session records and hash refresh tokens; the project already gives me a clear place to add that.

### Q: Why bcrypt?

Passwords must not be stored in plaintext or with fast general-purpose hashes. bcrypt is designed for password hashing and intentionally makes brute-force attempts expensive. The model hook hashes on save, and login compares the candidate password with the stored hash.

### Q: Why Multer and Cloudinary?

Multer handles multipart form data and temporarily stages uploaded files. Cloudinary provides durable media hosting, CDN delivery, and video metadata such as duration. Storing a URL in MongoDB is much more practical than storing large video binaries in the database or serving them directly from the Node server.

### Q: Why use aggregation pipelines?

Many screens need combined information: a comment plus author profile, number of likes, and whether the current viewer has liked it. Aggregation lets MongoDB do that work in one structured query using stages such as `$match`, `$lookup`, `$addFields`, and `$project`. It avoids doing one query for the list and then extra queries for every item.

### Q: Why use `mongoose-aggregate-paginate-v2`?

Video and comment lists can grow large. The plugin adds page and limit behavior to aggregation pipelines while returning useful pagination metadata. It saves repetitive skip, limit, and total-count logic and keeps controllers focused on the actual data pipeline.

### Q: Why use HTTP-only cookies if you also return tokens in JSON?

HTTP-only cookies support browser clients because JavaScript cannot directly read them, which reduces exposure to some XSS-based token theft. Returning tokens in the response also makes testing in Postman or consuming the API from mobile clients straightforward. In a stricter browser-only production design, I would keep refresh tokens out of JSON and rely on carefully configured secure cookies.

## 3. Architecture and Design Questions

### Q: Explain the architecture in simple terms.

The client calls a route. Middleware first handles shared concerns such as JWT verification or file parsing. The route calls a controller. The controller validates input, checks authorization, calls Mongoose models and Cloudinary helpers, and returns a standardized response. Models define the data and reusable logic. Utilities handle cross-cutting behavior such as errors, async wrappers, and uploads.

### Q: Why use MVC-style separation?

It keeps responsibilities clear. Routes should not contain business logic, controllers should not duplicate model definitions, and upload or error behavior should not be copied into every feature. This organization also makes testing easier because each layer has a narrower responsibility.

### Q: How does a request move through the application?

For a protected request such as publishing a video: Express receives it, `verifyJWT` verifies the user, Multer parses the files, the video controller validates title and description, uploads media to Cloudinary, creates a Video document with the authenticated owner ID, and returns a 201 response. Errors move through `asyncHandler` to the global error middleware.

### Q: Why use a separate Like model?

A like is a relationship between a user and a target resource, and it has its own timestamp. Keeping it separate lets the API query likes by user, count likes for a target, and use the same pattern for videos, comments, and tweets without embedding huge arrays in those documents.

### Q: Why use a separate Subscription model?

Subscription is a many-to-many relationship: one user can subscribe to many channels, and one channel can have many subscribers. A separate collection stores each relationship once and supports both directions efficiently.

### Q: Why use references instead of embedding user data in every video or comment?

User details can change, and content can grow significantly. References avoid duplicating the same profile data everywhere. When the client needs a combined view, the API uses `$lookup` to attach only the safe public fields such as username, full name, and avatar.

### Q: What is the hardest part of the architecture?

The main challenge is not any one endpoint; it is maintaining consistency across related features. For example, video upload connects authentication, temporary files, Cloudinary, MongoDB, owner authorization, views, watch history, likes, comments, playlists, and dashboard counts. Designing the boundaries so each concern has a clear home was the most important part.

## 4. Feature-Specific Questions

### Q: How does registration work?

The registration endpoint validates required text fields, checks for an existing username or email, requires an avatar, uploads avatar and optional cover image to Cloudinary, creates the user, and returns the created user after removing password and refresh token fields.

### Q: How does login work?

The user can log in with email or username and password. The API finds the user, compares the password through bcrypt, generates access and refresh tokens, stores the current refresh token on the user document, sends cookies, and returns sanitized user data.

### Q: How do you protect an update or delete endpoint?

Authentication provides `req.user`. Then the controller fetches the resource and compares `resource.owner` with `req.user._id`. If they do not match, it returns 403. This is important because being logged in alone should not let someone edit another person’s video, tweet, comment, or playlist.

### Q: Why compare ObjectIds as strings?

ObjectIds are objects in JavaScript. Two objects with the same underlying ID are not safely comparable using `===` because they can be different object instances. Converting both values to strings compares the actual identifier value.

### Q: How does video upload work?

The user sends a multipart request containing `videoFile`, `thumbnail`, title, and description. Multer places files in `public/temp`. The controller uploads both files to Cloudinary, uses the returned secure URLs and video duration, creates the Video document, and returns the result. The helper removes temporary files after upload.

### Q: How do likes work?

They use toggle behavior. The API searches for a Like for both the current user and the target. If it exists, it deletes it and returns `liked: false`. If it does not exist, it creates it and returns `liked: true`.

### Q: How do comments show like counts and author details efficiently?

The comment endpoint uses an aggregation pipeline. It filters comments by video, joins each comment owner, joins likes, calculates `likesCount`, checks whether the requesting user appears in the likes array, removes raw intermediary data, sorts by date, and paginates the result.

### Q: What happens when a user watches a video?

The video endpoint increments the video view count using MongoDB’s atomic `$inc` operator and adds the video ID to the authenticated user’s watch history through `$addToSet`, which prevents duplicate IDs. The history endpoint then joins videos with their public owner information.

### Q: How do playlists work?

Users create playlists that they own. Only the playlist owner can update, delete, add videos, or remove videos. The API validates IDs, verifies video/playlist existence, and prevents adding a video already present in the playlist.

### Q: What does the dashboard calculate?

For the authenticated creator, it calculates subscriber total, total videos, total views, and total likes. It also returns the channel’s videos with an individual like count. The stats endpoint runs independent aggregation work concurrently with `Promise.all`.

## 5. Comparison to Your Other Resume Projects

### Q: How is this different from your AI Interview Preparation Platform?

The AI Interview Preparation Platform is a more complete full-stack product with React, Gemini integration, Zod-validated AI output, Docker, and deployment. This Social Media API is intentionally a focused backend project. It helped me build the fundamentals that carry into the larger project: token-based authentication, MongoDB relationships, middleware, validation, API design, and secure file handling.

### Q: What did this project teach you that helped on the AI platform?

It strengthened my understanding of access/refresh tokens, HTTP-only cookies, CORS, Mongoose schema design, and route-level authorization. Those ideas directly apply to the secure cross-domain authentication and backend structure in the AI platform, where the security requirements are even more important.

### Q: How is this different from the multithreaded proxy server?

The proxy server focuses on low-level networking, raw TCP sockets, POSIX threads, synchronization, and caching. The Social Media API focuses on application-level HTTP design, identity, persistence, media services, and business rules. Together they show that I can work at different layers: systems/networking fundamentals and modern web-backend development.

### Q: Does your AI Trainer experience influence this project work?

Yes. Evaluating model outputs for factual accuracy and instruction adherence makes me more careful about correctness, clear error cases, and honest documentation. In this project, that mindset shows up in standardized API responses, validation, ownership checks, and explicitly documenting production improvements instead of overstating what v1 provides.

## 6. Tradeoffs and Honest Improvement Questions

### Q: What would you improve first?

I would add automated integration tests and input-validation schemas first, because they protect existing behavior as the API grows. Next I would add rate limiting, file-type/size restrictions, unique compound indexes for likes and subscriptions, a production `start` script, OpenAPI documentation, and CI.

### Q: Is this production-ready?

It is a complete v1 backend with realistic core features, but I would not call it fully production-hardened yet. A production deployment needs automated tests, rate limits, stronger validation, upload controls, logging/monitoring, robust media deletion metadata, and data-integrity cleanup for related records. Being clear about that is more accurate than treating feature completeness as operational completeness.

### Q: What data-integrity issue would you address?

Video deletion currently removes the video document and attempts Cloudinary cleanup, but a robust version should also handle related comments, likes, playlist references, and watch-history references. I would use a MongoDB transaction where suitable, or a carefully designed cleanup workflow/background job for cross-system actions.

### Q: How would you prevent duplicate likes or subscriptions under concurrency?

The controller checks before creating, but two concurrent requests can still race. I would add compound unique indexes, such as `{ video: 1, likedBy: 1 }` for video likes and `{ channel: 1, subscriber: 1 }` for subscriptions, then handle duplicate-key errors gracefully. The database should enforce important invariants, not only application code.

### Q: How would you improve upload security?

I would add Multer file-size limits, allowed MIME types, extension checks, optional malware/content scanning, per-user upload quotas, and direct signed Cloudinary uploads for scaling. I would also store Cloudinary `public_id` and `resource_type` rather than deriving delete identifiers from URLs.

### Q: How would you make the feed scale?

I would whitelist sort fields, add indexes for frequent filters and joins, use text search or a search service instead of broad regex at scale, move from page-number pagination to cursor pagination for high-churn feeds, cache popular public reads, and consider precomputed counters or analytics events where aggregation cost becomes high.

### Q: What security risks remain in v1?

The main gaps are rate limiting, validation schemas, upload constraints, CSRF strategy for cookie-authenticated browsers, hashed refresh-token storage, per-device session handling, strong logging/monitoring, and production cookie configuration. These are clear next steps, not problems I would ignore in deployment.

### Q: Why not use microservices?

For this scope, a modular monolith is easier to understand, deploy, and debug. I already separate features into modules. I would extract a service only when there is a real operational reason, such as independent media processing, search, notifications, or high-volume analytics. Microservices add network, deployment, observability, and consistency complexity.

## 7. Behavioral Questions Connected to This Project

### Q: Tell me about a challenging part of a project.

One challenging part was designing read endpoints that returned useful client data without creating many database calls. For comments, tweets, and channel data, I needed the resource, author profile, counts, and current-user interaction state together. I learned to break this into MongoDB aggregation stages, validate the output shape, and project only the public fields needed by the client. The result was a cleaner endpoint and a better understanding of database-side joins.

### Q: Tell me about a time you improved a design.

While building media updates and deletion, I recognized that updating the database alone would leave unused hosted files. I introduced a Cloudinary cleanup helper and used it after successful replacement or deletion flows. In a next iteration, I would improve it further by persisting Cloudinary public IDs and handling cross-system failure recovery, but the key design change was treating hosted assets as part of the resource lifecycle.

### Q: How do you handle work you have not implemented yet?

I separate core completion from production hardening. I document the current behavior, identify the risks, prioritize based on impact, and turn them into concrete next steps. For this API, automated tests and validation are first because they make further changes safer; after that, I would strengthen rate limiting, upload policy, indexes, and operational monitoring.

### Q: What did you learn from this project?

I learned that backend work is mostly about boundaries and invariants: who is allowed to do what, which data is authoritative, how related collections are queried efficiently, and what must happen when an operation fails halfway through. I also became much more comfortable with aggregation pipelines, media upload lifecycle, and the difference between an API that works locally and one that is ready for production operations.

## 8. Short Closing Answers

### Q: What are you most proud of here?

I am most proud that it is a coherent backend rather than disconnected endpoints. Authentication, media uploads, ownership checks, social interactions, aggregations, and dashboards all connect through a consistent model and response pattern.

### Q: If you had one more week, what would you add?

I would add integration tests, Zod or Joi validation, rate limits, OpenAPI documentation, unique database indexes, and a Dockerized local development setup. That would make the project much easier for another developer to run, test, and extend.

### Q: What would you do differently if starting again?

I would design the database indexes and deletion/cascade strategy earlier, introduce validation schemas from the start, persist Cloudinary identifiers instead of only URLs, and create tests alongside each feature. The v1 gave me the working domain model; a second pass would make the operational guarantees stronger.

### Q: What should an interviewer remember about this project?

It demonstrates that I can take a realistic backend domain from authentication through uploads, social relationships, aggregation queries, and API design. I understand both what the v1 solves and the engineering work required to make it production-hardened.

---

Reference documents:

- [Technical walkthrough](./INTERVIEW_PREP_V1.md)
- [Repository README](./README.md)
