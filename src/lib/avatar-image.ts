import { validProfileAvatar } from "./github-models";

/** Crop once on the client. Only bounded, re-encoded raster data reaches GitHub. */
export async function avatarImage(image: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(image.type) || image.size > 20 * 1024 * 1024) throw new Error("Choose a PNG, JPEG, WebP or GIF under 20 MiB.");
  const bitmap = await createImageBitmap(image);
  try {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 320;
    const side = Math.min(bitmap.width, bitmap.height);
    canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 320, 320);
    const avatar = canvas.toDataURL("image/webp", .85);
    if (!validProfileAvatar(avatar)) throw new Error("This image is too large after compression. Try another photo.");
    return avatar;
  } finally { bitmap.close(); }
}
