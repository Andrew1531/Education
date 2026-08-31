import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import schoolsRouter from "./schools";
import schoolOutreachRouter from "./schoolOutreach";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(schoolsRouter);
router.use(schoolOutreachRouter);

export default router;
