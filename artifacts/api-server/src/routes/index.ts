import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mediaWebhookRouter from "./media-webhook";
import mediaUrlRouter from "./media-url";
import advancedMessagesRouter from "./advanced-messages";
import sharedInboxRouter from "./shared-inbox";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mediaWebhookRouter);
router.use(mediaUrlRouter);
router.use(advancedMessagesRouter);
router.use(sharedInboxRouter);

export default router;
