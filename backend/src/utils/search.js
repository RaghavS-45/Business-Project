/**
 * Case-insensitive "contains" match for search-as-you-type.
 * The input is escaped, so characters like "(" or "+" are matched literally.
 */
export const containsRegex = (text) =>
  new RegExp(String(text).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
