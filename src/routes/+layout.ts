import { browser } from '$app/environment';
import { initI18n, waitLocale } from '$lib/i18n';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data }) => {
	if (browser) {
		const urlParams = new URLSearchParams(window.location.search);
		const langParam = urlParams.get('lang');
		const stored = localStorage.getItem('locale');
		const lang = langParam ?? stored ?? undefined;
		if (langParam) localStorage.setItem('locale', langParam);
		initI18n(lang);
	} else {
		initI18n('en');
	}

	await waitLocale();
	// Forward server load data (e.g. user) to layout/page components.
	return { ...data };
};
