import logger from "../../../utils/logger.js";
import { AppError } from "../../../utils/appError.js";
import {
  EMAIL_VERIFY_CODE_TTL_MINUTES,
  PASSWORD_RESET_CODE_TTL_MINUTES,
} from "./auth.config.js";

const getEmailTransportConfig = () => {
  const host = process.env.SMTP_HOST || "";
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.SMTP_FROM || user;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = (process.env.SMTP_SECURE || "false").toLowerCase() === "true";

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
  };
};

const sendCodeEmail = async ({
  to,
  code,
  subject,
  title,
  intro,
  expiresMinutes,
}) => {
  const config = getEmailTransportConfig();
  if (!config.host || !config.user || !config.pass || !config.from) {
    throw new AppError(
      "Email service is not configured",
      500,
      "EMAIL_NOT_CONFIGURED"
    );
  }

  let nodemailer;
  try {
    const imported = await import("nodemailer");
    nodemailer = imported.default || imported;
  } catch (err) {
    logger.error({ err }, "nodemailer import failed");
    throw new AppError(
      "Email transport is unavailable. Install nodemailer dependency.",
      500,
      "EMAIL_TRANSPORT_NOT_AVAILABLE"
    );
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const appName = process.env.APP_NAME || "Marketplace";
  const emailSubject = `${appName} ${subject}`;
  const text = `${intro} ${code}. It expires in ${expiresMinutes} minutes.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.4">
      <h2>${appName}</h2>
      <p>${title}</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
      <p>This code expires in ${expiresMinutes} minutes.</p>
      <p>If you did not request this, ignore this email.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: config.from,
      to,
      subject: emailSubject,
      text,
      html,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send verification email");
    throw new AppError(
      "Unable to send verification email",
      502,
      "EMAIL_DELIVERY_FAILED"
    );
  }
};

export const sendVerificationEmail = async ({ to, code }) =>
  sendCodeEmail({
    to,
    code,
    subject: "email verification code",
    title: "Your verification code:",
    intro: "Your verification code is",
    expiresMinutes: EMAIL_VERIFY_CODE_TTL_MINUTES,
  });

export const sendPasswordResetEmail = async ({ to, code }) =>
  sendCodeEmail({
    to,
    code,
    subject: "password reset code",
    title: "Your password reset code:",
    intro: "Your password reset code is",
    expiresMinutes: PASSWORD_RESET_CODE_TTL_MINUTES,
  });
