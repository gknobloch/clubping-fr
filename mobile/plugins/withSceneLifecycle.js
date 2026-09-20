const fs = require('node:fs');
const path = require('node:path');
const {
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('@expo/config-plugins');

/**
 * Adopts the UIKit scene-based life cycle, which iOS 27 requires (#588).
 *
 * An app built against the iOS 27 SDK that has not adopted scenes is refused at
 * launch: `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`
 * raises and the process traps with EXC_BREAKPOINT, before any JavaScript runs.
 * It looks exactly like a crash on startup, and it only happens on iOS 27 — a
 * simulator still on 26 launches the very same binary, which is what makes it
 * easy to misread as a device problem.
 *
 * Expo SDK 57 ships `ExpoAppSceneDelegate` for this and says so in its own
 * doc comment, but its prebuild template still generates the pre-scene
 * AppDelegate and offers no switch. So this plugin does the three things the
 * migration needs, on every prebuild:
 *
 *   1. declares `UIApplicationSceneManifest` in Info.plist;
 *   2. writes a `SceneDelegate` subclassing `ExpoAppSceneDelegate`, and adds it
 *      to the app target;
 *   3. takes the window out of `AppDelegate`, because under the scene life
 *      cycle the window comes from the connecting `UIWindowScene` and building
 *      one in `didFinishLaunchingWithOptions` would leave a second, empty one.
 *
 * Delete this once an Expo release generates the scene life cycle itself — and
 * check with a *clean* prebuild against an iOS 27 device, never a simulator
 * left on 26.
 */

const SCENE_DELEGATE_FILENAME = 'SceneDelegate.swift';

const SCENE_DELEGATE_SOURCE = `internal import Expo

/// Le cycle de vie par scènes, exigé par iOS 27 (#588).
///
/// Écrit par \`plugins/withSceneLifecycle.js\` à chaque prebuild : \`ios/\` est
/// ignoré par git et régénéré, donc ce fichier ne peut pas être maintenu à la
/// main.
///
/// \`ExpoAppSceneDelegate\` fait tout le travail : il bâtit la \`UIWindow\` depuis
/// la scène qui se connecte, démarre React Native dedans, et réachemine vers
/// l'\`AppDelegate\` les événements que le cycle par scènes lui retire — l'URL de
/// démarrage à froid comprise, que \`Linking.getInitialURL()\` ne lit que dans
/// les \`launchOptions\`.
class SceneDelegate: ExpoAppSceneDelegate {}
`;

/** The window now belongs to the scene; the app delegate must not make one. */
const WINDOW_BLOCK =
  /[ \t]*#if os\(iOS\) \|\| os\(tvOS\)\r?\n[\s\S]*?startReactNative\([\s\S]*?\)\r?\n[ \t]*#endif\r?\n/;

function withSceneManifest(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            // `$(PRODUCT_MODULE_NAME)` rather than the app name: the Swift
            // module is what UIKit resolves the class in, and it follows a
            // rename of the target on its own.
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return config;
  });
}

function withSceneReadyAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes('ExpoReactNativeFactoryProvider')) {
      contents = contents.replace(
        'class AppDelegate: ExpoAppDelegate {',
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {'
      );
    }

    if (WINDOW_BLOCK.test(contents)) {
      contents = contents.replace(
        WINDOW_BLOCK,
        '    // La fenêtre et le démarrage de React Native appartiennent à\n' +
          '    // `SceneDelegate` : sous le cycle de vie par scènes, la fenêtre vient\n' +
          '    // de la scène qui se connecte (voir plugins/withSceneLifecycle.js).\n'
      );
    }

    // Loud rather than silent: a template that stops matching would otherwise
    // produce an app that traps at launch on every iOS 27 device, and the
    // prebuild that caused it would have looked perfectly clean.
    if (
      !contents.includes('ExpoReactNativeFactoryProvider') ||
      contents.includes('UIWindow(frame:')
    ) {
      throw new Error(
        'withSceneLifecycle: AppDelegate.swift no longer matches what this plugin ' +
          'rewrites. The scene life cycle is required by iOS 27 — check whether ' +
          'Expo now generates it, and delete this plugin if so.'
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

function withSceneDelegateFile(config) {
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const dir = path.join(
        config.modRequest.platformProjectRoot,
        config.modRequest.projectName
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, SCENE_DELEGATE_FILENAME),
        SCENE_DELEGATE_SOURCE
      );
      return config;
    },
  ]);

  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const group = config.modRequest.projectName;
    const filepath = `${group}/${SCENE_DELEGATE_FILENAME}`;

    if (!project.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: group,
        project,
      });
    }
    return config;
  });
}

module.exports = function withSceneLifecycle(config) {
  config = withSceneManifest(config);
  config = withSceneReadyAppDelegate(config);
  config = withSceneDelegateFile(config);
  return config;
};
