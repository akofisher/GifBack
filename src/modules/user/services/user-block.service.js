import { forbidden } from "../../../utils/appError.js";
import {
  USER_BLOCK_SUPPORT_URL,
  USER_BLOCK_TYPES,
  USER_TEMPORARY_BLOCK_DAYS,
} from "../user-block.constants.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const TEMPORARY_BLOCK_MESSAGE = `You are blocked for ${USER_TEMPORARY_BLOCK_DAYS} days because of breaking our community rules. For more information contact our support team: ${USER_BLOCK_SUPPORT_URL}`;
const PERMANENT_BLOCK_MESSAGE = `You are permanently blocked because of breaking our community rules. For more information contact our support team: ${USER_BLOCK_SUPPORT_URL}`;

const parseDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const normalizeUserBlockType = (value) => {
  if (value === USER_BLOCK_TYPES.TEMPORARY_14_DAYS) {
    return USER_BLOCK_TYPES.TEMPORARY_14_DAYS;
  }
  if (value === USER_BLOCK_TYPES.PERMANENT) {
    return USER_BLOCK_TYPES.PERMANENT;
  }
  return USER_BLOCK_TYPES.NONE;
};

export const buildTemporaryBlockUntil = (now = new Date()) =>
  new Date(now.getTime() + USER_TEMPORARY_BLOCK_DAYS * DAY_MS);

export const getUserBlockState = (user, now = new Date()) => {
  const isActive = user?.isActive !== false;
  const blockType = normalizeUserBlockType(user?.accessBlock?.type);
  const blockedUntil = parseDateOrNull(user?.accessBlock?.until);

  if (isActive) {
    return {
      isBlocked: false,
      isTemporaryExpired: false,
      blockType: USER_BLOCK_TYPES.NONE,
      blockedUntil: null,
    };
  }

  if (blockType === USER_BLOCK_TYPES.TEMPORARY_14_DAYS) {
    if (blockedUntil && blockedUntil <= now) {
      return {
        isBlocked: false,
        isTemporaryExpired: true,
        blockType: USER_BLOCK_TYPES.TEMPORARY_14_DAYS,
        blockedUntil,
      };
    }

    return {
      isBlocked: true,
      isTemporaryExpired: false,
      blockType: USER_BLOCK_TYPES.TEMPORARY_14_DAYS,
      blockedUntil,
    };
  }

  return {
    isBlocked: true,
    isTemporaryExpired: false,
    blockType: USER_BLOCK_TYPES.PERMANENT,
    blockedUntil: null,
  };
};

export const buildPublicUserBlockState = (user, now = new Date()) => {
  const state = getUserBlockState(user, now);

  return {
    blockType: state.isBlocked ? state.blockType : USER_BLOCK_TYPES.NONE,
    blockedUntil:
      state.isBlocked && state.blockType === USER_BLOCK_TYPES.TEMPORARY_14_DAYS
        ? state.blockedUntil
        : null,
    isBlocked: state.isBlocked,
  };
};

const blockErrorDetails = (blockedUntil) => {
  const details = [{ field: "supportUrl", message: USER_BLOCK_SUPPORT_URL }];
  if (blockedUntil) {
    details.push({ field: "blockedUntil", message: blockedUntil.toISOString() });
  }
  return details;
};

export const enforceUserAccessBlock = async (user, { autoUnblockExpired = true } = {}) => {
  if (!user) return;

  const now = new Date();
  const state = getUserBlockState(user, now);

  if (state.isTemporaryExpired && autoUnblockExpired) {
    user.isActive = true;
    user.accessBlock = {
      type: USER_BLOCK_TYPES.NONE,
      until: null,
      updatedAt: now,
      updatedBy: null,
    };
    await user.save();
    return;
  }

  if (!state.isBlocked) return;

  if (state.blockType === USER_BLOCK_TYPES.TEMPORARY_14_DAYS) {
    throw forbidden(
      TEMPORARY_BLOCK_MESSAGE,
      "USER_BLOCKED_TEMPORARY",
      blockErrorDetails(state.blockedUntil)
    );
  }

  throw forbidden(
    PERMANENT_BLOCK_MESSAGE,
    "USER_BLOCKED_PERMANENT",
    blockErrorDetails(null)
  );
};
