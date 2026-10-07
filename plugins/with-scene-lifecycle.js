// Adopts the UIScene life cycle that the iOS 27 SDK requires: without it UIKit
// asserts at launch. SDK 57 templates still start React Native from the app
// delegate, so this moves window creation into ExpoAppSceneDelegate.
const fs = require("node:fs");
const path = require("node:path");
const {
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require("expo/config-plugins");

const SCENE_DELEGATE_FILE = "SceneDelegate.swift";

const SCENE_DELEGATE_SOURCE = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {}
`;

const WINDOW_BOOTSTRAP =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

function withSceneManifest(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return mod;
  });
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== "swift") {
      throw new Error("with-scene-lifecycle expects a Swift AppDelegate");
    }
    let contents = mod.modResults.contents;
    if (!contents.includes("ExpoReactNativeFactoryProvider")) {
      contents = contents.replace(
        "class AppDelegate: ExpoAppDelegate {",
        "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
      );
    }
    if (WINDOW_BOOTSTRAP.test(contents)) {
      contents = contents.replace(WINDOW_BOOTSTRAP, "\n");
    }
    if (!contents.includes("ExpoReactNativeFactoryProvider") || contents.includes("UIScreen.main.bounds")) {
      throw new Error("with-scene-lifecycle could not patch AppDelegate.swift");
    }
    mod.modResults.contents = contents;
    return mod;
  });
}

function withSceneDelegateFile(config) {
  config = withDangerousMod(config, [
    "ios",
    (mod) => {
      const projectName = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
      const target = path.join(mod.modRequest.platformProjectRoot, projectName, SCENE_DELEGATE_FILE);
      fs.writeFileSync(target, SCENE_DELEGATE_SOURCE);
      return mod;
    },
  ]);
  return withXcodeProject(config, (mod) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    const filepath = `${projectName}/${SCENE_DELEGATE_FILE}`;
    if (!mod.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project: mod.modResults,
      });
    }
    return mod;
  });
}

module.exports = (config) => withSceneDelegateFile(withSceneAppDelegate(withSceneManifest(config)));
