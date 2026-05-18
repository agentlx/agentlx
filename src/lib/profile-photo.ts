import {
  profilePhotoAllowedMimeTypes,
  profilePhotoInputMaxBytes,
  profilePhotoInputMaxSizeLabel,
  profilePhotoSizePx,
} from "@/lib/auth";

const PROFILE_PHOTO_SOURCE_MIN_SIZE = 128;
const PROFILE_PHOTO_SOURCE_MAX_SIZE = 4096;

export async function prepareSquareProfilePhoto(file: File) {
  const normalizedType = String(file.type || "").toLowerCase();
  if (
    !profilePhotoAllowedMimeTypes.includes(
      normalizedType as (typeof profilePhotoAllowedMimeTypes)[number],
    )
  ) {
    throw new Error("Use uma imagem PNG ou JPEG.");
  }

  if (file.size > profilePhotoInputMaxBytes) {
    throw new Error(`A foto original precisa ter no maximo ${profilePhotoInputMaxSizeLabel}.`);
  }

  const image = await loadImageFromFile(file);
  if (image.width < PROFILE_PHOTO_SOURCE_MIN_SIZE || image.height < PROFILE_PHOTO_SOURCE_MIN_SIZE) {
    throw new Error(
      `A foto precisa ter pelo menos ${PROFILE_PHOTO_SOURCE_MIN_SIZE}x${PROFILE_PHOTO_SOURCE_MIN_SIZE}px.`,
    );
  }

  if (image.width > PROFILE_PHOTO_SOURCE_MAX_SIZE || image.height > PROFILE_PHOTO_SOURCE_MAX_SIZE) {
    throw new Error(
      `A foto precisa ter no maximo ${PROFILE_PHOTO_SOURCE_MAX_SIZE}x${PROFILE_PHOTO_SOURCE_MAX_SIZE}px.`,
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = profilePhotoSizePx;
  canvas.height = profilePhotoSizePx;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Nao foi possivel preparar a foto selecionada.");
  }

  const cropSize = Math.min(image.width, image.height);
  const cropX = Math.floor((image.width - cropSize) / 2);
  const cropY = Math.floor((image.height - cropSize) / 2);

  context.clearRect(0, 0, profilePhotoSizePx, profilePhotoSizePx);
  context.drawImage(
    image,
    cropX,
    cropY,
    cropSize,
    cropSize,
    0,
    0,
    profilePhotoSizePx,
    profilePhotoSizePx,
  );

  const outputMimeType = normalizedType === "image/png" ? "image/png" : "image/jpeg";
  const imageDataUrl = canvas.toDataURL(
    outputMimeType,
    outputMimeType === "image/jpeg" ? 0.9 : undefined,
  );
  if (!imageDataUrl.startsWith(`data:${outputMimeType};base64,`)) {
    throw new Error("Nao foi possivel converter a foto para o formato esperado.");
  }

  return {
    imageDataUrl,
    mimeType: outputMimeType as (typeof profilePhotoAllowedMimeTypes)[number],
    width: profilePhotoSizePx,
    height: profilePhotoSizePx,
  };
}

async function loadImageFromFile(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Nao foi possivel ler a foto selecionada."));
      image.decoding = "async";
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
