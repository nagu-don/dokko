import express from "express";
import { loginUser, registerUser, googleAuthUser, listUsers, getProfile, updatePhone } from "../controllers/userController.js";
import { authAdmin, authUser } from "../middleware/authMiddleware.js";

const userRouter = express.Router();

userRouter.post("/register", registerUser);
userRouter.post("/login", loginUser);
userRouter.post("/google", googleAuthUser);
userRouter.get("/me", authUser, getProfile);
userRouter.patch("/phone", authUser, updatePhone);
userRouter.get("/all", authAdmin, listUsers);

export default userRouter;
