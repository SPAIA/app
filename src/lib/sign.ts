import QRCode from 'qrcode';

const NAVY = '#0C2464';

/** Fraction of the base sign's width/height the QR code occupies, and where it sits. */
const QR_BOX = { x: 0.5664, y: 0.2016, size: 0.3072 };

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Failed to load ${src}`));
		img.src = src;
	});
}

/**
 * Composites the SPAIA sign template with a QR code linking to a spot's
 * observe page, and triggers a PNG download of the result.
 */
export async function downloadSpotSign(spotSlug: string, origin: string) {
	// utm_source=qr, not a printer/owner id — see $lib/analytics/track.ts for why
	// identifying who printed a given sign is kept server-side (spots.owner_id)
	// instead of being embedded in a link that ends up posted in public.
	const observeUrl = `${origin}/observe/${spotSlug}?utm_source=qr`;

	const [base, qr] = await Promise.all([
		loadImage('/sign/spot-sign-base.png'),
		QRCode.toDataURL(observeUrl, {
			margin: 0,
			color: { dark: NAVY, light: '#0000' }
		}).then(loadImage)
	]);

	const canvas = document.createElement('canvas');
	canvas.width = base.width;
	canvas.height = base.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	ctx.drawImage(base, 0, 0);

	const qrSize = base.width * QR_BOX.size;
	ctx.drawImage(qr, base.width * QR_BOX.x, base.height * QR_BOX.y, qrSize, qrSize);

	const link = document.createElement('a');
	link.download = `spaia-sign-${spotSlug}.png`;
	link.href = canvas.toDataURL('image/png');
	link.click();
}
