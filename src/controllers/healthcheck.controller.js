import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

/*
  Healthcheck endpoint — used by monitoring tools, load balancers,
  and deployment pipelines to verify the server is alive and responsive.    
  Still need to study the above topics but its just for fututre reference .

  GET /api/v1/healthcheck
  → 200 OK  (no auth required)
*/
const healthcheck = asyncHandler(async (req, res) => {
    const data = {
        status: "OK",
        message: "Server is up and running",
        uptime: `${Math.floor(process.uptime())}s`,       // seconds since server started
        timestamp: new Date().toISOString(),               // current UTC time
        environment: process.env.NODE_ENV || "development",
        nodeVersion: process.version,
    }

    return res
        .status(200)
        .json(new ApiResponse(200, data, "Healthcheck passed"))
})

export {
    healthcheck
}

/*
A basic healthcheck only reports whether the Express server is reachable. 
It doesn't perform any operations that require validation or depend on external 
services. Since there are no expected failure conditions inside the controller,
 there's nothing to throw as an ApiError. Any unexpected runtime errors would 
 already be handled by the global error middleware through asyncHandler.
 If the endpoint were extended to verify dependencies like MongoDB or Redis, 
 then I'd use ApiError to return a 503 Service Unavailable when those checks fail.
*/
/*
An endpoint is a specific URL combined with an HTTP method that exposes a resource or 
functionality of a server, allowing clients to send requests and receive responses
*/