import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { argosScreenshot } from '@argos-ci/playwright';
import { test } from '@playwright/test';

type StoryIndex = {
	entries: Record<
		string,
		{ id: string; title: string; name: string; type: string }
	>;
};

const indexPath = fileURLToPath(
	new URL(
		'../libs/@guardian/source/storybook-static/index.json',
		import.meta.url,
	),
);
const index: StoryIndex = JSON.parse(readFileSync(indexPath, 'utf-8'));

const only = process.env.ARGOS_ONLY?.split(',').map((s) => s.trim());

const stories = Object.values(index.entries).filter(
	(entry) => entry.type === 'story' && (!only || only.includes(entry.id)),
);

for (const story of stories) {
	test(`${story.title} › ${story.name}`, async ({ page }) => {
		await page.goto(`/iframe.html?id=${story.id}&viewMode=story`);

		// Wait for Storybook's own render cycle. Storybook 8+ exposes the active
		// renders on `__STORYBOOK_PREVIEW__.storyRenders`; match the one for this
		// story (fall back to the latest). Some stories render in a portal and
		// leave #storybook-root empty, so don't wait on the root itself.
		await page.waitForFunction((id) => {
			const renders =
				(
					window as unknown as {
						__STORYBOOK_PREVIEW__?: {
							storyRenders?: Array<{ id?: string; phase?: string }>;
						};
					}
				).__STORYBOOK_PREVIEW__?.storyRenders ?? [];
			const render = renders.find((r) => r.id === id) ?? renders.at(-1);
			return render?.phase === 'completed' || render?.phase === 'finished';
		}, story.id);

		// Respect the repo's own `chromatic: { disableSnapshot: true }` story
		// parameters, so a story opted out of Chromatic stays opted out here.
		const disableSnapshot = await page.evaluate((id) => {
			const renders =
				(
					window as unknown as {
						__STORYBOOK_PREVIEW__?: {
							storyRenders?: Array<{
								id?: string;
								story?: {
									parameters?: { chromatic?: { disableSnapshot?: boolean } };
								};
							}>;
						};
					}
				).__STORYBOOK_PREVIEW__?.storyRenders ?? [];
			const render = renders.find((r) => r.id === id) ?? renders.at(-1);
			return render?.story?.parameters?.chromatic?.disableSnapshot === true;
		}, story.id);
		test.skip(
			disableSnapshot,
			'story opts out of snapshots (chromatic parameter)',
		);

		// SVG SMIL animations (`<animateTransform>`, as used by Spinner) run on
		// the SVG animation clock rather than CSS, so neither reduced motion nor
		// the CSS-level stabilizations stop them. Pin the clock to a fixed frame.
		await page.evaluate(() => {
			for (const svg of document.querySelectorAll('svg')) {
				if (typeof svg.pauseAnimations === 'function') {
					svg.setCurrentTime(0);
					svg.pauseAnimations();
				}
			}
		});

		// Scrolling lists may settle on a non-deterministic offset: pin every
		// scroll position before capturing.
		await page.evaluate(() => {
			for (const el of document.querySelectorAll('*')) {
				if (el.scrollLeft !== 0) el.scrollLeft = 0;
				if (el.scrollTop !== 0) el.scrollTop = 0;
			}
		});

		await argosScreenshot(page, story.id);
	});
}
