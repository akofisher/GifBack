export const patchJsonResponseCapture = (res) => {
  if (res.locals?._jsonCapturePatched) {
    return;
  }

  if (!res.locals) {
    // eslint-disable-next-line no-param-reassign
    res.locals = {};
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.locals.responseBody = body;
    return originalJson(body);
  };

  res.locals._jsonCapturePatched = true;
};
