import MarketplaceEvent from "../models/event.model.js";

const normalizeEventEntry = (entry) => ({
  type: entry.type,
  actorId: entry.actorId || null,
  requestId: entry.requestId || null,
  itemId: entry.itemId || null,
  offeredItemId: entry.offeredItemId || null,
  ownerId: entry.ownerId || null,
  requesterId: entry.requesterId || null,
  metadata: entry.metadata || {},
});

export const createMarketplaceEvents = async (entries, session = null) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  const docs = entries.filter(Boolean).map(normalizeEventEntry);
  if (!docs.length) {
    return;
  }

  await MarketplaceEvent.insertMany(docs, { session });
};
