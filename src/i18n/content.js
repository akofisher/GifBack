import { normalizeLanguage } from "./localization.js";

export const CONTENT_LOCALES = Object.freeze(["en", "ka"]);

const toPlainObject = (value) => {
  if (!value) return {};
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return { ...value };
  }
  return {};
};

const normalizeText = (value) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

export const toPlainTranslations = (value) => {
  const source = toPlainObject(value);
  return CONTENT_LOCALES.reduce((acc, locale) => {
    const nextValue = normalizeText(source[locale]);
    if (nextValue) {
      acc[locale] = nextValue;
    }
    return acc;
  }, {});
};

export const normalizeTranslationsInput = (value) => toPlainTranslations(value);

export const resolveLocalizedText = ({
  locale,
  baseValue = "",
  translations = {},
  fallbackValue = "",
}) => {
  const normalizedLocale = normalizeLanguage(locale);
  const dictionary = toPlainTranslations(translations);

  return (
    dictionary[normalizedLocale] ||
    dictionary.en ||
    normalizeText(fallbackValue) ||
    normalizeText(baseValue) ||
    ""
  );
};
