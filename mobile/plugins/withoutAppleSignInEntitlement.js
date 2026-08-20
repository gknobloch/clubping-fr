const { withEntitlementsPlist } = require('@expo/config-plugins');

/**
 * Strips the Sign in with Apple entitlement (com.apple.developer.applesignin).
 *
 * expo-apple-authentication's own config plugin is applied automatically for
 * autolinked packages (SDK 55), so it writes that entitlement whether or not
 * the plugin is listed in app.json and whether or not `ios.usesAppleSignIn` is
 * set. The Apple sign-in button is hidden until the OAuth client ids are
 * configured (#129 / #100), so the binary would ship a capability it never
 * asks for.
 *
 * The package, `loginWithApple` in AuthContext and expo-apple-authentication
 * all stay in place: re-enabling the button means deleting this plugin from
 * app.json and running prebuild again.
 */
module.exports = function withoutAppleSignInEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['com.apple.developer.applesignin'];
    return config;
  });
};
