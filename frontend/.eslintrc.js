/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: 'next/core-web-vitals',
  rules: {
    // This is the pages/ router rule. The app uses the App Router, where a <link> in
    // the root layout is the documented way to load webfonts, and there is no
    // pages/_document.js to add one to.
    '@next/next/no-page-custom-font': 'off',
    // The menu photographs come from Pexels and Unsplash at a fixed aspect ratio and
    // are already sized by their container, so next/image adds a loader for no gain.
    '@next/next/no-img-element': 'off',
  },
  ignorePatterns: ['node_modules/', '.next/', 'out/', 'next-env.d.ts'],
};
