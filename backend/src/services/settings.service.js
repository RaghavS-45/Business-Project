import StoreSettings from "../models/StoreSettings.js";

/**
 * Store settings — one document. Until an admin saves it, defaults are used.
 *
 * get() is a plain read (no upsert) because every checkout calls it inside
 * its transaction; a write here would make concurrent checkouts conflict.
 */
class SettingsService {
  async get(session = null) {
    const settings = await StoreSettings.findById("store").session(session);
    return settings ?? new StoreSettings();
  }

  async update(data) {
    return StoreSettings.findOneAndUpdate(
      { _id: "store" },
      { $set: data },
      { upsert: true, new: true, runValidators: true }
    );
  }
}

export default new SettingsService();
