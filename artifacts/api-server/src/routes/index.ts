import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sharedInboxRouter from "./shared-inbox";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sharedInboxRouter);

export default router;
