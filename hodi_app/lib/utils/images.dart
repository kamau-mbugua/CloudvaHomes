
class Images {
  static const String backgroundPng = 'assets/image/background.png';
  static const String userprofile = 'assets/image/user_profile.png';
  static const String noFoodImage = 'assets/image/no_food.png';


  // for Icon
  static const String logo = 'assets/image/new_hodi_logo.png';
  static const String cameraIcon = 'assets/icon/camera.png';
  static const String kcb_icon = 'assets/icon/kcb_icon.png';


  static const String dashboardIcon = 'assets/icon/dashboard_icon.png';
  static const String userProfile = 'assets/icon/user_profile.png';
  static const String totalInvoicesIcon = 'assets/icon/total_invoices_icon.png';
  static const String totalPaymentIcon = 'assets/icon/total_payment_icon.png';
  static const String totalArrearsIcon = 'assets/icon/total_arrears_icon.png';
  static const String housesIcon = 'assets/icon/houses_icon.png';
  static const String totalExpenditure = 'assets/icon/total_expenditure.png';
  static const String tenantsIcon = 'assets/icon/tenants_icon.png';
  static const String propertyDropdown = 'assets/icon/property_dropdown.png';

  static String getImageUrl(imageName) => 'assets/image/$imageName.png';
  static String getPaymentImage(String name) => 'assets/payment/$name.png';
  static String getShareIcon(String name) => 'assets/icon/$name.png';


}
