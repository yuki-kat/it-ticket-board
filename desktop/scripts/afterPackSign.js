// Ad-hoc signs the macOS app after packing so Apple Silicon Macs will launch it.
// Without a paid Apple Developer certificate, macOS still shows a one-time
// "unidentified developer" prompt; this only prevents the hard block.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  console.log(`[afterPackSign] Ad-hoc signing ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  console.log('[afterPackSign] Done.');
};
