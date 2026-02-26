import { z } from "zod";
import {
  createAdminCategory,
  createAdminLocationCity,
  createAdminLocationCountry,
  deleteAdminCategory,
  deleteAdminLocationCity,
  deleteAdminLocationCountry,
  deleteAdminItem,
  deleteUserByAdmin,
  getAdminItemById,
  getAdminStats,
  listAdminStaff,
  listAdminCategories,
  listAdminLocations,
  listAdminItems,
  listAdminUsers,
  registerAdminStaff,
  setUserBlockedState,
  updateAdminLocationCity,
  updateAdminLocationCountry,
  updateAdminCategory,
  updateAdminItem,
} from "../services/admin.service.js";
import { getTopGivenLeaderboard } from "../../user/services/user.service.js";
import {
  adminCreateCategorySchema,
  adminCreateLocationCitySchema,
  adminCreateLocationCountrySchema,
  adminListStaffQuerySchema,
  adminListItemsQuerySchema,
  adminListUsersQuerySchema,
  adminRegisterStaffSchema,
  adminUpdateLocationCitySchema,
  adminUpdateLocationCountrySchema,
  adminUpdateCategorySchema,
  adminUpdateItemSchema,
  adminUserToggleSchema,
} from "../validators/admin.validators.js";

const adminLeaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

export const getAdminStatsHandler = async (req, res, next) => {
  try {
    const stats = await getAdminStats();
    res.status(200).json({ success: true, stats });
  } catch (err) {
    next(err);
  }
};

export const getAdminTopGivenLeaderboardHandler = async (req, res, next) => {
  try {
    const query = adminLeaderboardQuerySchema.parse(req.query || {});
    const data = await getTopGivenLeaderboard(query.limit, {
      includeContacts: true,
    });

    res.status(200).json({
      success: true,
      data,
      leaderboard: data.items,
    });
  } catch (err) {
    next(err);
  }
};

export const listAdminUsersHandler = async (req, res, next) => {
  try {
    const query = adminListUsersQuerySchema.parse(req.query || {});
    const result = await listAdminUsers(query, req.user.role);
    res.status(200).json({
      success: true,
      data: {
        items: result.users,
        pagination: result.pagination,
      },
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

export const setAdminUserBlockedStateHandler = async (req, res, next) => {
  try {
    const payload = adminUserToggleSchema.parse(req.body);
    const user = await setUserBlockedState({
      adminId: req.user.id,
      actorRole: req.user.role,
      targetUserId: req.params.id,
      isActive: payload.isActive,
    });
    res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

export const deleteAdminUserHandler = async (req, res, next) => {
  try {
    const result = await deleteUserByAdmin({
      adminId: req.user.id,
      targetUserId: req.params.id,
    });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

export const listAdminStaffHandler = async (req, res, next) => {
  try {
    const query = adminListStaffQuerySchema.parse(req.query || {});
    const result = await listAdminStaff(query);
    res.status(200).json({
      success: true,
      data: {
        items: result.users,
        pagination: result.pagination,
      },
      users: result.users,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
};

export const registerAdminStaffHandler = async (req, res, next) => {
  try {
    const payload = adminRegisterStaffSchema.parse(req.body);
    const user = await registerAdminStaff(payload);
    res.status(201).json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

export const listAdminCategoriesHandler = async (req, res, next) => {
  try {
    const categories = await listAdminCategories({ locale: req.locale });
    res.status(200).json({ success: true, categories });
  } catch (err) {
    next(err);
  }
};

export const createAdminCategoryHandler = async (req, res, next) => {
  try {
    const payload = adminCreateCategorySchema.parse(req.body);
    const category = await createAdminCategory(payload, { locale: req.locale });
    res.status(201).json({ success: true, category });
  } catch (err) {
    next(err);
  }
};

export const updateAdminCategoryHandler = async (req, res, next) => {
  try {
    const payload = adminUpdateCategorySchema.parse(req.body);
    const category = await updateAdminCategory(req.params.id, payload, {
      locale: req.locale,
    });
    res.status(200).json({ success: true, category });
  } catch (err) {
    next(err);
  }
};

export const deleteAdminCategoryHandler = async (req, res, next) => {
  try {
    const result = await deleteAdminCategory(req.params.id);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

export const listAdminLocationsHandler = async (req, res, next) => {
  try {
    const countries = await listAdminLocations({ locale: req.locale });
    res.status(200).json({ success: true, countries });
  } catch (err) {
    next(err);
  }
};

export const createAdminLocationCountryHandler = async (req, res, next) => {
  try {
    const payload = adminCreateLocationCountrySchema.parse(req.body);
    const country = await createAdminLocationCountry(payload, {
      locale: req.locale,
    });
    res.status(201).json({ success: true, country });
  } catch (err) {
    next(err);
  }
};

export const updateAdminLocationCountryHandler = async (req, res, next) => {
  try {
    const payload = adminUpdateLocationCountrySchema.parse(req.body);
    const country = await updateAdminLocationCountry(req.params.countryId, payload, {
      locale: req.locale,
    });
    res.status(200).json({ success: true, country });
  } catch (err) {
    next(err);
  }
};

export const deleteAdminLocationCountryHandler = async (req, res, next) => {
  try {
    const result = await deleteAdminLocationCountry(req.params.countryId);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

export const createAdminLocationCityHandler = async (req, res, next) => {
  try {
    const payload = adminCreateLocationCitySchema.parse(req.body);
    const country = await createAdminLocationCity(req.params.countryId, payload, {
      locale: req.locale,
    });
    res.status(201).json({ success: true, country });
  } catch (err) {
    next(err);
  }
};

export const updateAdminLocationCityHandler = async (req, res, next) => {
  try {
    const payload = adminUpdateLocationCitySchema.parse(req.body);
    const country = await updateAdminLocationCity(
      req.params.countryId,
      req.params.cityId,
      payload,
      { locale: req.locale }
    );
    res.status(200).json({ success: true, country });
  } catch (err) {
    next(err);
  }
};

export const deleteAdminLocationCityHandler = async (req, res, next) => {
  try {
    const country = await deleteAdminLocationCity(
      req.params.countryId,
      req.params.cityId,
      { locale: req.locale }
    );
    res.status(200).json({ success: true, country });
  } catch (err) {
    next(err);
  }
};

export const listAdminItemsHandler = async (req, res, next) => {
  try {
    const query = adminListItemsQuerySchema.parse(req.query || {});
    const result = await listAdminItems(query);
    res.status(200).json({
      success: true,
      data: {
        items: result.items,
        pagination: result.pagination,
      },
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

export const getAdminItemByIdHandler = async (req, res, next) => {
  try {
    const item = await getAdminItemById(req.params.id);
    res.status(200).json({ success: true, item });
  } catch (err) {
    next(err);
  }
};

export const updateAdminItemHandler = async (req, res, next) => {
  try {
    const payload = adminUpdateItemSchema.parse(req.body);
    const item = await updateAdminItem(req.params.id, payload);
    res.status(200).json({ success: true, item });
  } catch (err) {
    next(err);
  }
};

export const deleteAdminItemHandler = async (req, res, next) => {
  try {
    const item = await deleteAdminItem({
      itemId: req.params.id,
      actorId: req.user.id,
    });
    res.status(200).json({ success: true, item });
  } catch (err) {
    next(err);
  }
};
