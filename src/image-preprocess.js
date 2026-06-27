import { isRemoteEndpoint } from "./privacy.js";

let sharpPromise;

export async function prepareImageForVision(image, config) {
  const settings = imageSettings(config);
  if (!settings.preprocess) return image;
  if (!image.buffer) {
    return {
      ...image,
      preprocessing: {
        enabled: true,
        skipped: true,
        reason: "direct_url_transport",
      },
    };
  }
  if (!shouldPreprocessForProvider(config, settings)) {
    return {
      ...image,
      preprocessing: {
        enabled: true,
        skipped: true,
        reason: "not_local_endpoint",
        mode: settings.preprocessMode,
      },
    };
  }

  const sharp = await loadSharp();
  if (!sharp) {
    return {
      ...image,
      preprocessing: {
        enabled: true,
        skipped: true,
        reason: "sharp_not_installed",
      },
    };
  }

  const input = sharp(image.buffer, { animated: false, failOn: "none" });
  const metadata = await input.metadata();
  const originalWidth = Number(metadata.width || 0);
  const originalHeight = Number(metadata.height || 0);
  if (!originalWidth || !originalHeight) {
    return {
      ...image,
      preprocessing: {
        enabled: true,
        skipped: true,
        reason: "image_dimensions_unknown",
      },
    };
  }

  const maxSourceSide = Math.max(originalWidth, originalHeight);
  const shouldResize = maxSourceSide > settings.maxDimension;
  const shouldConvert = settings.convertToJpeg && image.mime !== "image/jpeg";

  if (!shouldResize && !shouldConvert) {
    return {
      ...image,
      width: originalWidth,
      height: originalHeight,
      preprocessing: {
        enabled: true,
        skipped: true,
        reason: "already_within_limits",
        originalWidth,
        originalHeight,
        originalBytes: image.buffer.length,
      },
    };
  }

  let pipeline = sharp(image.buffer, { animated: false, failOn: "none" }).rotate();
  if (shouldResize) {
    pipeline = pipeline.resize({
      width: settings.maxDimension,
      height: settings.maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  let mime = image.mime;
  if (shouldConvert) {
    pipeline = pipeline.flatten({ background: "#ffffff" }).jpeg({
      quality: settings.jpegQuality,
      mozjpeg: true,
    });
    mime = "image/jpeg";
  } else if (mime === "image/png") {
    pipeline = pipeline.png({ compressionLevel: 9 });
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    ...image,
    buffer: data,
    mime,
    width: info.width,
    height: info.height,
    preprocessing: {
      enabled: true,
      skipped: false,
      resized: shouldResize,
      converted: mime !== image.mime,
      originalMime: image.mime,
      originalWidth,
      originalHeight,
      originalBytes: image.buffer.length,
      sentMime: mime,
      sentWidth: info.width,
      sentHeight: info.height,
      sentBytes: data.length,
      maxDimension: settings.maxDimension,
      jpegQuality: settings.jpegQuality,
    },
  };
}

export async function imagePreprocessStatus(config) {
  const settings = imageSettings(config);
  return {
    ...settings,
    activeForProvider: shouldPreprocessForProvider(config, settings),
    sharpAvailable: Boolean(await loadSharp()),
  };
}

function imageSettings(config) {
  const imageConfig = config.image || {};
  return {
    preprocess: imageConfig.preprocess !== false,
    preprocessMode: imageConfig.preprocessMode || "local-only",
    maxDimension: clampNumber(imageConfig.maxDimension, 256, 4096, 1280),
    jpegQuality: clampNumber(imageConfig.jpegQuality, 40, 100, 85),
    convertToJpeg: imageConfig.convertToJpeg !== false,
  };
}

function shouldPreprocessForProvider(config, settings) {
  if (settings.preprocessMode === "always") return true;
  if (settings.preprocessMode === "never") return false;
  if (config.provider?.plan === "local" || config.provider?.name === "local") return true;
  try {
    return !isRemoteEndpoint(config.provider?.baseUrl || "");
  } catch {
    return false;
  }
}

async function loadSharp() {
  if (!sharpPromise) {
    sharpPromise = import("sharp")
      .then((module) => module.default || module)
      .catch(() => null);
  }
  return sharpPromise;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
