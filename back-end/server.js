import "dotenv/config";
import express from "express"
import update from "./dataUpdate/dataUpdate.js";
import cors from "cors";
import itemRouter from "./routes/itemRouter.js";
import userRouter from "./routes/userRouter.js";
import adminRouter from "./routes/adminRouter.js";
import orderRouter from "./routes/orderRouter.js";
import vendorRouter from "./routes/vendorRouter.js";
import { loadGateway } from "./gateway/index.js";
import { connectDB } from "./config/db.js";
import { startScheduler } from "./services/priorityScheduler.js";

update();

// load payment gateway configuration from environment variables
try {
  loadGateway();
  console.log("Payment gateway loaded");
} catch (err) {
  console.error("Payment gateway config error:", err.message);
}

// connect to database and ensure prime admin exists
connectDB();

// start the priority-search stage-advancement scheduler
// internally waits for the DB connection to be ready
startScheduler();

//app config
const app=express();
const port=4000;

//middleware
app.use(express.json())
app.use(cors())

//api endpoints
app.use("/api/items",itemRouter)
app.use("/api/users",userRouter)
app.use("/api/admins",adminRouter)
app.use("/api/orders",orderRouter)
app.use("/api/vendors",vendorRouter)
app.use("/images",express.static('uploads'))


app.get("/",(req,res)=>{
    res.send("API Working")
})

app.listen(port,()=>{
    console.log(`Server is listenin on http://localhost:${port}`)
})