import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private static let fcmTokenKey = "kodihub_fcm_token"

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "KodiHubPushBridge") {
      let channel = FlutterMethodChannel(
        name: "co.ke.kodihub.push",
        binaryMessenger: registrar.messenger()
      )
      channel.setMethodCallHandler { call, result in
        switch call.method {
        case "getToken":
          result(UserDefaults.standard.string(forKey: AppDelegate.fcmTokenKey))
        case "setToken":
          if let args = call.arguments as? [String: Any],
             let token = args["token"] as? String,
             !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            UserDefaults.standard.set(
              token.trimmingCharacters(in: .whitespacesAndNewlines),
              forKey: AppDelegate.fcmTokenKey
            )
          }
          result(true)
        default:
          result(FlutterMethodNotImplemented)
        }
      }
    }
  }
}
