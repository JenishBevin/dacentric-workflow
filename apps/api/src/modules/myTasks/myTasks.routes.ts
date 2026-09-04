import { Router } from "express";
import { asyncHandler, ok } from "../../common/http";
import { authenticate } from "../../middleware/authenticate";
import { getMyTasks } from "./myTasks.service";

export const myTasksRouter = Router();
myTasksRouter.use(authenticate);

myTasksRouter.get(
  "/",
  asyncHandler(async (req, res) => ok(res, await getMyTasks(req.user!)))
);
