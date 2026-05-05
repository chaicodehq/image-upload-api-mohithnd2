import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Image } from "../models/image.model.js";
import { generateThumbnail, getImageDimensions } from "../utils/thumbnail.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * TODO: Upload image
 *
 * 1. Check if file uploaded (if !req.file, return 400 "No file uploaded")
 * 2. Get file info from req.file (filename, originalname, mimetype, size)
 * 3. Get image dimensions using getImageDimensions(filepath)
 * 4. Generate thumbnail using generateThumbnail(filename)
 * 5. Extract optional fields from req.body (description, tags)
 *    - Parse tags: split by comma and trim each tag
 * 6. Save metadata to database (Image.create)
 * 7. Return 201 with image metadata
 */
export async function uploadImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: { message: "No file uploaded" },
      });
    }

    const filepath = path.join(__dirname, "../../uploads", req.file.filename);

    const dimensions = await getImageDimensions(filepath);
    const thumbnailFilename = await generateThumbnail(req.file.filename);

    const description = req.body.description ?? "";
    const tags = req.body.tags
      ? req.body.tags.split(",").map((t) => t.trim())
      : [];

    const image = await Image.create({
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      width: dimensions.width,
      height: dimensions.height,
      thumbnailFilename,
      description,
      tags,
    });

    return res.status(201).json(image);
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: List images with pagination and filtering
 */
export async function listImages(req, res, next) {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      mimetype,
      sortBy = "uploadDate",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { originalName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (mimetype) {
      query.mimetype = mimetype;
    }

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 50);
    const skip = (pageNum - 1) * limitNum;

    const total = await Image.countDocuments(query);

    const images = await Image.find(query)
      .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
      .skip(skip)
      .limit(limitNum);

    const totalSizeAgg = await Image.aggregate([
      { $match: query },
      { $group: { _id: null, totalSize: { $sum: "$size" } } },
    ]);

    const totalSize = totalSizeAgg[0]?.totalSize || 0;

    return res.status(200).json({
      data: images,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
        totalSize,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Get image metadata by ID
 */
export async function getImage(req, res, next) {
  try {
    const image = await Image.findById(req.params.id);

    if (!image) {
      return res.status(404).json({
        error: { message: "Image not found" },
      });
    }

    return res.status(200).json(image);
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Download original image
 */
export async function downloadImage(req, res, next) {
  try {
    const image = await Image.findById(req.params.id);

    if (!image) {
      return res.status(404).json({
        error: { message: "Image not found" },
      });
    }

    const filepath = path.join(__dirname, "../../uploads", image.filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        error: { message: "File not found" },
      });
    }

    res.setHeader("Content-Type", image.mimetype);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${image.originalName}"`,
    );

    return res.sendFile(filepath);
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Download thumbnail
 */
export async function downloadThumbnail(req, res, next) {
  try {
    const image = await Image.findById(req.params.id);

    if (!image) {
      return res.status(404).json({
        error: { message: "Image not found" },
      });
    }

    const thumbnailPath = path.join(
      __dirname,
      "../../uploads/thumbnails",
      image.thumbnailFilename,
    );

    if (!fs.existsSync(thumbnailPath)) {
      return res.status(404).json({
        error: { message: "File not found" },
      });
    }

    res.setHeader("Content-Type", "image/jpeg");

    return res.sendFile(thumbnailPath);
  } catch (error) {
    next(error);
  }
}

/**
 * TODO: Delete image
 */
export async function deleteImage(req, res, next) {
  try {
    const image = await Image.findById(req.params.id);

    if (!image) {
      return res.status(404).json({
        error: {
          message: "Image not found",
        },
      });
    }

    // delete original file
    try {
      const filePath = path.join(__dirname, "../../uploads", image.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error("Error deleting original file:", err);
      }
    }

    // delete thumbnail file
    try {
      const thumbnailPath = path.join(
        __dirname,
        "../../uploads/thumbnails",
        image.thumbnailFilename,
      );

      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
      }
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error("Error deleting thumbnail:", err);
      }
    }

    await Image.findByIdAndDelete(req.params.id);

    return res.status(204).send();
  } catch (error) {
    next(error);
  }
}
