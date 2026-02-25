import {
  localizeResponseBody,
  resolveRequestLocale,
} from "../i18n/localization.js";

export const localeMiddleware = (req, res, next) => {
  const locale = resolveRequestLocale(req);
  req.locale = locale;
  res.setHeader("Content-Language", locale);

  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson(localizeResponseBody(body, locale));

  next();
};

