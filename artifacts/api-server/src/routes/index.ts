import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import schoolsRouter from "./schools";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(schoolsRouter);

export default router;
