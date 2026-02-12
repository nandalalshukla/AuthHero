import express from "express";
import authRoutes from "./modules/auth/auth.routes";
import { errorMiddleware } from "./middlewares/error.middleware";

const app = express();
app.use(express.json());
app.use(errorMiddleware);
app.use("/auth", authRoutes);





export default app;
