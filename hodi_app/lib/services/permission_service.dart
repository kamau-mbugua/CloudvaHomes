import 'package:permission_handler/permission_handler.dart';

class PermissionService {
  Future<void> requestPermissions() async {
    await Permission.notification.isDenied.then((value) {
      if (value) {
        Permission.notification.request();
        Permission.camera.request();
        Permission.storage.request();
        Permission.manageExternalStorage.request();
        Permission.notification.request();
      }
    });
  }
}