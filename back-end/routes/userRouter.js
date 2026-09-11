import express from "express";
import { loginUser, registerUser, googleAuthUser, listUsers, getProfile, updatePhone } from "../controllers/userController.js";
import { authAdmin, authUser } from "../middleware/authMiddleware.js";
import { userLoginLimiter, registerLimiter, googleAuthLimiter } from "../middleware/rateLimiter.js";

const userRouter = express.Router();

userRouter.post("/register", registerLimiter, registerUser);
userRouter.post("/login", userLoginLimiter, loginUser);
userRouter.post("/google", googleAuthLimiter, googleAuthUser);
userRouter.get("/me", authUser, getProfile);
userRouter.patch("/phone", authUser, updatePhone);
userRouter.get("/all", authAdmin, listUsers);

export default userRouter;
