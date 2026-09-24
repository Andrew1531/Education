import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import schoolsRouter from "./schools";
import schoolOutreachRouter from "./schoolOutreach";
import institutionsRouter from "./institutions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(schoolsRouter);
router.use(schoolOutreachRouter);
router.use(institutionsRouter);

export default router;
