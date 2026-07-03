import { defineConfig } from 'wxt';

export default defineConfig({
  browser: 'chrome',
  manifestVersion: 3,
  targetBrowsers: ['chrome', 'firefox'],
  suppressWarnings: {
    firefoxDataCollection: true,
  },
  manifest: ({ browser }) => {
    const firefox = browser === 'firefox';
    return {
      name: 'IG Flwr - Follower Manager',
      version: '0.1.0',
      description: 'Scrape followers/following, analyze follow-back status, and manage with follow/unfollow/remove actions.',
      permissions: ['storage'],
      host_permissions: ['*://*.instagram.com/*'],
      ...(firefox
        ? {
            browser_specific_settings: {
              gecko: {
                id: 'igflwr@example.com',
                strict_min_version: '109.0',
              },
            },
          }
        : {}),
    };
  },
});
