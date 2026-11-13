import Counter from "../models/Counter.js";

/**
 * Daily document numbers: <SERIES>-YYYYMMDD-NNNN (e.g. INV-20261113-0042,
 * CN-20261113-0003).
 *
 * The sequence comes from an atomic counter (one document per series per
 * IST day) incremented inside the caller's transaction, so:
 *   - two simultaneous requests can never get the same number
 *     (the second hits a write conflict and is retried),
 *   - a transaction that fails rolls its increment back (no gaps),
 *   - the day rolls over at midnight IST, not UTC.
 */

const STORE_TIMEZONE = "Asia/Kolkata";

/** Store calendar day as YYYYMMDD. */
export const storeDay = (date = new Date()) =>
  date.toLocaleDateString("en-CA", { timeZone: STORE_TIMEZONE }).replace(/-/g, "");

/**
 * Highest sequence number already used by documents whose `field` starts
 * with `prefix`.
 */
export async function highestSequence(model, field, prefix, session = null) {
  const [row] = await model
    .aggregate([
      { $match: { [field]: { $regex: `^${prefix}` } } },
      {
        $group: {
          _id: null,
          max: {
            $max: {
              $convert: {
                input: { $substrCP: [`$${field}`, prefix.length, 10] },
                to: "int",
                onError: 0,
                onNull: 0,
              },
            },
          },
        },
      },
    ])
    .session(session);
  return row?.max ?? 0;
}

/**
 * Next number in a series.
 *
 * @param {Object}  opts
 * @param {string}  opts.series  - "INV", "CN", ...
 * @param {string}  opts.counter - counter name, e.g. "invoice"
 * @param {Model}   opts.model   - model holding the numbers (to continue after existing ones)
 * @param {string}  opts.field   - field on that model, e.g. "invoiceNumber"
 * @param {ClientSession} [opts.session]
 * @param {Date}    [opts.now]
 */
export async function nextDocumentNumber({ series, counter, model, field, session = null, now = new Date() }) {
  const day = storeDay(now);
  const key = `${counter}-${day}`;
  const prefix = `${series}-${day}-`;

  let doc = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, session }
  );

  // First number of the day: carry on after any documents that already
  // exist for this day (e.g. created before the counter existed).
  if (doc.seq === 1) {
    const highest = await highestSequence(model, field, prefix, session);
    if (highest > 0) {
      doc = await Counter.findOneAndUpdate({ _id: key }, { $set: { seq: highest + 1 } }, { new: true, session });
    }
  }

  return `${prefix}${String(doc.seq).padStart(4, "0")}`;
}

/**
 * Safety net: move a series' counter for the day past every number in use.
 */
export async function resyncCounter({ series, counter, model, field, now = new Date() }) {
  const day = storeDay(now);
  const highest = await highestSequence(model, field, `${series}-${day}-`);
  await Counter.updateOne({ _id: `${counter}-${day}` }, { $max: { seq: highest } }, { upsert: true });
}
