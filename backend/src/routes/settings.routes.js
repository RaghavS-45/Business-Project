import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import authorize from "../middleware/authorize.js";
import validate from "../middleware/validate.js";
import settingsService from "../services/settings.service.js";
import { updateStoreSettingsSchema } from "../validators/settings.validator.js";
import { GST_STATES } from "../utils/gst.js";

/**
 * Store Settings Routes
 *
 * GET /api/settings/store   — Store details + pricing mode (authenticated; the POS needs it)
 * PUT /api/settings/store   — Update store details (ADMIN)
 * GET /api/settings/states  — GST state codes, for dropdowns
 */
const router = Router();
router.use(authenticate);

router.get("/store", async (_req, res, next) => {
  try {
    const settings = await settingsService.get();
    res.json({ success: true, data: { settings } });
  } catch (error) {
    next(error);
  }
});

router.put("/store", authorize("ADMIN"), validate(updateStoreSettingsSchema), async (req, res, next) => {
  try {
    const settings = await settingsService.update(req.body);
    res.json({ success: true, message: "Store settings saved", data: { settings } });
  } catch (error) {
    next(error);
  }
});

router.get("/states", (_req, res) => {
  const states = Object.entries(GST_STATES).map(([code, name]) => ({ code, name }));
  res.json({ success: true, data: { states } });
});

export default router;
