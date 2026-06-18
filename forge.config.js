/** @type {import('@electron-forge/shared-types').ForgeConfig} */
module.exports = {
  packagerConfig: {
    name: 'SRT Translator',
    executableName: 'srt-translator',
    appBundleId: 'com.shatoshi2001.srt-translator',
    asar: true,
    ignore: [
      /^\/out(\/|$)/,
      /\.md$/,
      /\.gitignore$/,
    ],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'srt-translator',
        setupExe: 'SRT-Translator-Setup.exe',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'Shatoshi2001',
          name: 'str-translator',
        },
      },
    },
  ],
};
