import { defineConfig } from '@playwright/test';

// Path is relative to this config file's directory (Playwright's default
// webServer cwd), i.e. `<repo>/argos` → `<repo>/libs/@guardian/source`.
const STORYBOOK_STATIC = '../libs/@guardian/source/storybook-static';
const PORT = process.env.ARGOS_PORT ?? '6006';
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
	testDir: '.',
	testMatch: 'stories.spec.ts',
	timeout: 60_000,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 4 : 6,
	fullyParallel: true,
	reporter:
		process.env.ARGOS_TOKEN || process.env.CI
			? [['list'], ['@argos-ci/playwright/reporter']]
			: 'list',
	use: {
		baseURL: BASE_URL,
		contextOptions: { reducedMotion: 'reduce' },
		launchOptions: {
			// Subpixel (LCD) text antialiasing produces colour fringing on glyph
			// edges that varies between runs on Linux/CI.
			args: ['--disable-lcd-text', '--font-render-hinting=none'],
		},
	},
	webServer: {
		command: `npx http-server ${STORYBOOK_STATIC} --port ${PORT} --silent`,
		url: `${BASE_URL}/iframe.html`,
		reuseExistingServer: true,
		timeout: 30_000,
	},
});
