import { Router, type IRouter } from "express";
import healthRouter from "./health";
import advancedMessagesRouter from "./advanced-messages";
import sharedInboxRouter from "./shared-inbox";

const router: IRouter = Router();

router.use(healthRouter);
router.use(advancedMessagesRouter);
router.use(sharedInboxRouter);

export default router;
