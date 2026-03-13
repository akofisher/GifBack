import { z } from "zod";
import { badRequest } from "../../utils/appError.js";
import { saveUploadedImage } from "./media.service.js";

const uploadQuerySchema = z.object({
  folder: z.string().trim().min(1).max(60).optional(),
});

const pickUploadedFiles = (req) => {
  const files = [];

  if (req.file) files.push(req.file);

  if (Array.isArray(req.files)) {
    files.push(...req.files);
  } else if (req.files && typeof req.files === "object") {
    if (Array.isArray(req.files.file)) files.push(...req.files.file);
    if (Array.isArray(req.files.files)) files.push(...req.files.files);
  }

  return files;
};

export const uploadMediaHandler = async (req, res, next) => {
  try {
    const { folder } = uploadQuerySchema.parse(req.body || {});
    const uploadedFiles = pickUploadedFiles(req);

    if (!uploadedFiles.length) {
      throw badRequest("Validation error", "MISSING_MEDIA_FILE", [
        { field: "file", message: "Image file is required" },
      ]);
    }

    const savedImages = await Promise.all(
      uploadedFiles.map((file) =>
        saveUploadedImage({
          file,
          folder: folder || "temp",
        })
      )
    );

    res.status(201).json({
      success: true,
      image: savedImages[0],
      images: savedImages,
    });
  } catch (error) {
    next(error);
  }
};
