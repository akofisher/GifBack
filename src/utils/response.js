export const sendSuccess = (res, payload = {}, status = 200) =>
  res.status(status).json({ success: true, ...payload });

export const sendList = (
  res,
  {
    items = [],
    pagination = { page: 1, limit: 0, total: 0, pages: 1 },
    key = "items",
    extra = {},
  },
  status = 200
) =>
  // Always expose `data.items` for uniform list contracts while keeping
  // legacy `data[key]` / top-level `[key]` compatibility.
  res.status(status).json({
    success: true,
    data: {
      items,
      ...(key !== "items" ? { [key]: items } : {}),
      pagination,
    },
    items,
    ...(key !== "items" ? { [key]: items } : {}),
    pagination,
    ...extra,
  });
