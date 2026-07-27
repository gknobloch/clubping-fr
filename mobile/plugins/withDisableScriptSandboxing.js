const { withXcodeProject } = require('@expo/config-plugins');

/**
 * Disables Xcode's "User Script Sandboxing" (ENABLE_USER_SCRIPT_SANDBOXING)
 * for the app target.
 *
 * CocoaPods' "[CP] Copy Pods Resources" build phase writes helper files
 * (e.g. Pods/resources-to-copy-<Target>.txt) that the script sandbox blocks,
 * causing the build to fail with a "Sandbox: bash deny(1) file-write-create"
 * error. Setting this to NO restores the pre-Xcode 15 behavior.
 *
 * This runs on every `expo prebuild`, so the setting survives regeneration
 * of the native ios/ project.
 */
module.exports = function withDisableScriptSandboxing(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();

    for (const key of Object.keys(configurations)) {
      const buildSettings = configurations[key].buildSettings;
      if (!buildSettings) continue;
      // Only touch configurations that belong to the app target.
      if (buildSettings.PRODUCT_NAME === undefined) continue;
      buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
    }

    return config;
  });
};
