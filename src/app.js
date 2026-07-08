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

app.use("/users", userRoutes)
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
export default app