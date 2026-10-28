
import 'package:dio/dio.dart';
import 'package:get_it/get_it.dart';
import 'package:hodi_app/providers/auth_provider.dart';
import 'package:hodi_app/providers/authenticated_app_providers.dart';
import 'package:hodi_app/providers/splash_provider.dart';
import 'package:hodi_app/providers/theme_provider.dart';
import 'package:hodi_app/repository/auth_repo.dart';
import 'package:hodi_app/repository/authenticated_repo.dart';
import 'package:hodi_app/repository/splash_repo.dart';
import 'package:hodi_app/utils/app_constants.dart';
import 'package:hodi_app/viewmodel/meter_added_view_model.dart';
import 'package:hodi_app/viewmodel/payment_view_model.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'flavors.dart';
import 'networking/datasource/remote/dio/dio_client.dart';
import 'networking/datasource/remote/dio/logging_interceptor.dart';

final sl = GetIt.instance;

Future<void> init() async {
  // Core
  sl.registerLazySingleton(() => DioClient(F.baseUrl, sl(), loggingInterceptor: sl(), sharedPreferences: sl()));

  // Repository
  sl.registerLazySingleton(() => SplashRepo(sharedPreferences: sl()));
  sl.registerLazySingleton(() => AuthRepo(dioClient: sl(), sharedPreferences: sl()));
  sl.registerLazySingleton(() => AuthenticatedRepo(dioClient: sl()));


  // Provider
  sl.registerFactory(() => SplashProvider(splashRepo: sl()));
  sl.registerFactory(() => ThemeProvider(sharedPreferences: sl()));
  sl.registerFactory(() => AuthProvider(authRepo: sl()));
  sl.registerFactory(() => AuthenticatedAppProviders(authenticatedRepo: sl()));



  // External
  final sharedPreferences = await SharedPreferences.getInstance();
  sl.registerLazySingleton(() => sharedPreferences);
  sl.registerLazySingleton(() => Dio());
  sl.registerLazySingleton(() => LoggingInterceptor());


  //ViewModel
  sl.registerFactory(() => PaymentViewModel());
  sl.registerFactory(() => MeterAddedViewModel());


}