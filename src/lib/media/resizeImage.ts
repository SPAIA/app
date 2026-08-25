/**
 * Downscales an image client-side before upload. Workers can't decode/resize
 * images without the paid Cloudflare Images binding, so this is the only
 * cheap place to do it — it also shrinks what DeepSeek Vision gets billed
 * for, since we send the same stored photo on to it.
 */
export async function resizeImageFile(file: File, maxDimension = 1280, quality = 0.82): Promise<File> {
	if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;

	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		return file; // unsupported/corrupt — let the server's own validation catch it
	}

	const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
	if (scale === 1 && file.type === 'image/jpeg') {
		bitmap.close();
		return file;
	}

	const width = Math.round(bitmap.width * scale);
	const height = Math.round(bitmap.height * scale);

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		bitmap.close();
		return file;
	}
	ctx.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
	if (!blob) return file;

	const name = file.name.replace(/\.\w+$/, '') + '.jpg';
	return new File([blob], name, { type: 'image/jpeg' });
}
