import assert from "node:assert/strict";
import test from "node:test";

import Category from "../../src/modules/marketplace/models/category.model.js";
import Donation from "../../src/modules/donation/models/donation.model.js";
import Blog from "../../src/modules/blog/models/blog.model.js";
import {
  normalizeTranslationsInput,
  resolveLocalizedText,
} from "../../src/i18n/content.js";
import { listCategories } from "../../src/modules/marketplace/services/marketplace.service.js";
import { getPublicDonations } from "../../src/modules/donation/services/donation.service.js";
import { listPublishedBlogs } from "../../src/modules/blog/services/blog.service.js";

test("resolveLocalizedText prefers locale translation then en then fallback/base", () => {
  const translations = normalizeTranslationsInput({
    ka: "ქვეყანა",
    en: "Country",
  });

  assert.equal(
    resolveLocalizedText({
      locale: "ka",
      baseValue: "Base",
      translations,
    }),
    "ქვეყანა"
  );

  assert.equal(
    resolveLocalizedText({
      locale: "fr",
      baseValue: "Base",
      translations,
    }),
    "Country"
  );

  assert.equal(
    resolveLocalizedText({
      locale: "ka",
      baseValue: "Base",
      translations: {},
      fallbackValue: "Fallback",
    }),
    "Fallback"
  );
});

test("listCategories returns localized names by locale", async () => {
  const originalFind = Category.find;
  Category.find = () => ({
    sort() {
      return this;
    },
    lean: async () => [
      {
        _id: "65f100000000000000000001",
        name: "Appliances",
        nameTranslations: { ka: "ტექნიკა" },
        isActive: true,
        order: 0,
      },
    ],
  });

  try {
    const localized = await listCategories("ka");
    assert.equal(localized[0].name, "ტექნიკა");

    const fallback = await listCategories("en");
    assert.equal(fallback[0].name, "Appliances");
  } finally {
    Category.find = originalFind;
  }
});

test("getPublicDonations localizes label", async () => {
  const originalFindOne = Donation.findOne;
  Donation.findOne = async () => ({
    key: "DONATION_SETTINGS",
    methods: [
      {
        _id: "65f100000000000000000010",
        label: "Bank Transfer",
        labelTranslations: { ka: "საბანკო გადარიცხვა" },
        accountNumber: "GE00TB000000000000",
        link: "",
        isActive: true,
        order: 0,
      },
    ],
    updatedAt: new Date("2026-02-26T00:00:00.000Z"),
  });

  try {
    const data = await getPublicDonations("ka");
    assert.equal(data.methods[0].label, "საბანკო გადარიცხვა");
  } finally {
    Donation.findOne = originalFindOne;
  }
});

test("listPublishedBlogs localizes title/summary/content", async () => {
  const originalFind = Blog.find;
  const originalCount = Blog.countDocuments;

  Blog.find = () => ({
    sort() {
      return this;
    },
    skip() {
      return this;
    },
    limit() {
      return this;
    },
    populate() {
      return this;
    },
    lean: async () => [
      {
        _id: "65f100000000000000000020",
        title: "Default title",
        titleTranslations: { ka: "ქართული სათაური" },
        summary: "Default summary",
        summaryTranslations: { ka: "ქართული მოკლე აღწერა" },
        content: "Default content",
        contentTranslations: { ka: "ქართული კონტენტი" },
        link: "",
        images: [],
        coverImage: null,
        isPublished: true,
        authorId: null,
        createdAt: new Date("2026-02-26T00:00:00.000Z"),
      },
    ],
  });
  Blog.countDocuments = async () => 1;

  try {
    const result = await listPublishedBlogs({ page: 1, limit: 20 }, "ka");
    assert.equal(result.blogs[0].title, "ქართული სათაური");
    assert.equal(result.blogs[0].summary, "ქართული მოკლე აღწერა");
    assert.equal(result.blogs[0].content, "ქართული კონტენტი");
  } finally {
    Blog.find = originalFind;
    Blog.countDocuments = originalCount;
  }
});
