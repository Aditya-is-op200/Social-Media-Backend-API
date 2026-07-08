import express from "express"
import cookieParser from "cookie-parser"
import cors from "cors"

const app = express()

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true  
}))
app.use(express.json({ limit: "16kb" }))

app.use(express.urlencoded({
    extended: true,
    limit: "16kb"
}))

app.use(express.static("public"))

app.use(cookieParser());


//routes import 

import userRoutes from "./routes/user.routes.js"


//routes declaration 

app.use("/api/vi/users", userRoutes)



export default app

/*
When this above line is executed, it means that any request that starts with "/users" will be handled by the userRoutes router.
For example, if a client sends a GET request to "/users/register", the userRoutes router will handle that request and look for a matching
 route defined in the user.routes.js file.
then the control goes to the user.routes.js file and looks for a matching route defined in that file. In this case, it will find the 
"/register" route and execute the corresponding handler function (registerUser) defined in the user.controller.js file.
Then the control goes to the user.controller.js file and executes the registerUser function, which contains the logic for handling 
the registration request.
the flow is like this:
1. Client sends a request to "/users/register"
2. The request is handled by the userRoutes router in user.routes.js
3. The router looks for a matching route ("/register") and executes the corresponding handler function (registerUser)
4. The registerUser function in user.controller.js handles the registration logic and sends a response back to the client.
*/

/* So as soon as someone requests the route "/users" , it will be handled 
by the userRoutes which is imported from the routes folder.
*/
/*we used to do 'app.get' but that was done when we were not exporting the 
 routes from the routes folder. Now we are importing the routes from the
  routes folder and then using them here. So we are using middlewares 
  to get it here so we use 'app.use' instead
  of app.get' or 'app.post' or 'app.put' or 'app.delete' etc.

  This is the Syntax for using the routes from the routes folder.
    The first parameter is the route path and the second parameter 
    is the route file.
  */