/**
 * Pixel dimensions read straight from image file headers — no decode, no
 * dependency. Workers can't run sharp/libvips, and every npm "image-size"
 * package assumes Node's fs, so this covers just the four types the media
 * upload endpoint accepts.
 */
export function getImageDimensions(buf: ArrayBuffer, mimeType: string): { width: number; height: number } | null {
	const view = new DataView(buf);
	switch (mimeType) {
		case 'image/png':
			return readPng(view);
		case 'image/jpeg':
			return readJpeg(view);
		case 'image/gif':
			return readGif(view);
		case 'image/webp':
			return readWebp(view);
		default:
			return null;
	}
}

function readPng(view: DataView): { width: number; height: number } | null {
	// 8-byte signature + 4-byte length + 4-byte "IHDR", then width/height.
	if (view.byteLength < 24) return null;
	return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readGif(view: DataView): { width: number; height: number } | null {
	if (view.byteLength < 10) return null;
	return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

function readJpeg(view: DataView): { width: number; height: number } | null {
	let offset = 2; // skip SOI (0xFFD8)
	while (offset + 9 < view.byteLength) {
		if (view.getUint8(offset) !== 0xff) return null;
		const marker = view.getUint8(offset + 1);
		const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
		if (isSof) {
			return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
		}
		offset += 2 + view.getUint16(offset + 2);
	}
	return null;
}

function read24LE(view: DataView, offset: number): number {
	return view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
}

function readWebp(view: DataView): { width: number; height: number } | null {
	if (view.byteLength < 30) return null;
	const fourCc = String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15));
	if (fourCc === 'VP8X') {
		return { width: read24LE(view, 24) + 1, height: read24LE(view, 27) + 1 };
	}
	if (fourCc === 'VP8 ') {
		return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
	}
	if (fourCc === 'VP8L') {
		const bits = view.getUint32(21, true);
		return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
	}
	return null;
}
