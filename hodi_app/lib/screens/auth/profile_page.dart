import 'package:flutter/material.dart';
import 'package:hodi_app/models/data/profile/profile_response.dart';
import 'package:hodi_app/utils/styles.dart';
import 'package:provider/provider.dart';

import '../../logger.dart';
import '../../providers/auth_provider.dart';
import '../../providers/authenticated_app_providers.dart';
import '../../route/routes.dart';
import '../../utils/dimensions.dart';

class ProfilePage extends StatefulWidget {
  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  UserProfileResponse? userProfile;
  bool isPasswordVisible = false;


  void getUserProfile() async {
    loggerNoStack.i(">>>>>>>>>fetchHouses<<<<<<<<<<");

    UserProfileResponse? fetchedProfile =
    await Provider.of<AuthenticatedAppProviders>(context, listen: false)
        .getUserProfile();

    setState(() {
      userProfile = fetchedProfile;
    });
  }

  @override
  void initState() {
    super.initState();
    Future.microtask(() => getUserProfile());
  }

  // Simulated delete account function that now accepts a password.
  Future<void> _deleteAccount(String password, String username) async {
    // TODO: Replace with your actual account deletion logic, verifying the password.
    loggerNoStack.i("Deleting account using password: $password $username");

    await Provider.of<AuthenticatedAppProviders>(context, listen: false).deleteAccount(username, password).then(
          (value) {
        if (value.status == "00") {
          // Handle successful account deletion
          // Handle successful account deletion
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text("${value.message}")))
              .closed
              .then((_) {
            // Perform logout after SnackBar is dismissed
            Provider.of<AuthProvider>(context, listen: false)
                .clearSharedData(context)
                .then((condition) {
              Navigator.pushNamedAndRemoveUntil(
                context,
                AppRoutes.getSplashPageRoute(),
                    (route) => false,
              );
            });
          });
        } else {
          // Handle failed account deletion
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(value.message)),
          );
        }
      },
    );
  }

  void _showDeleteConfirmation() {
    final TextEditingController usernameController = TextEditingController();
    final TextEditingController passwordController = TextEditingController();

    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              title: const Text('Confirm Account Deletion'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Are you sure you want to delete your account? This action cannot be undone. '
                        'Please enter your username and password to confirm.',
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: usernameController,
                    decoration: const InputDecoration(
                      labelText: 'Username',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: passwordController,
                    obscureText: !isPasswordVisible,
                    decoration: InputDecoration(
                      labelText: 'Password',
                      border: const OutlineInputBorder(),
                      suffixIcon: IconButton(
                        icon: Icon(
                          isPasswordVisible ? Icons.visibility : Icons.visibility_off,
                        ),
                        onPressed: () {
                          setState(() {
                            isPasswordVisible = !isPasswordVisible;
                          });
                        },
                      ),
                    ),
                  ),
                ],
              ),
              actions: <Widget>[
                TextButton(
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                  },
                  child: const Text('Cancel'),
                ),
                TextButton(
                  onPressed: () async {
                    final username = usernameController.text.trim();
                    final password = passwordController.text.trim();

                    if (username.isEmpty || password.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Username and password cannot be empty')),
                      );
                      return;
                    }

                    Navigator.of(dialogContext).pop();
                    await _deleteAccount(password,username); // Pass the password to your delete logic
                  },
                  child: const Text(
                    'Delete Account',
                    style: TextStyle(color: Colors.red),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Profile Page',
          style: poppinsSemiBold.copyWith(
            color: Theme.of(context).primaryColorDark,
            fontSize: Dimensions.fontSizeDefault,
          ),
        ),
        centerTitle: true,
      ),
      body: Consumer<AuthenticatedAppProviders>(
        builder: (context, provider, child) {
          return provider.isLoading
              ? const Center(
            child: CircularProgressIndicator(),
          )
              : userProfile == null
              ? Center(
            child: Text(
              'No data found',
              style: poppinsSemiBold.copyWith(
                color: Theme.of(context).primaryColor,
                fontSize: Dimensions.fontSizeDefault,
              ),
            ),
          )
              : SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: CircleAvatar(
                      radius: 50,
                      backgroundImage: userProfile?.photoUrl != null
                          ? NetworkImage(userProfile!.photoUrl!)
                          : null,
                      child: userProfile!.photoUrl == null
                          ? const Icon(Icons.person, size: 50)
                          : null,
                    ),
                  ),
                  const SizedBox(height: 16),
                  ListTile(
                    title: Text(
                      'Full Name',
                      style: poppinsSemiBold.copyWith(
                        color: Theme.of(context).primaryColor,
                        fontSize: Dimensions.fontSizeDefault,
                      ),
                    ),
                    subtitle: Text(userProfile!.fullNames),
                  ),
                  ListTile(
                    title: Text(
                      'Email',
                      style: poppinsSemiBold.copyWith(
                        color: Theme.of(context).primaryColor,
                        fontSize: Dimensions.fontSizeDefault,
                      ),
                    ),
                    subtitle: Text(userProfile!.email),
                  ),
                  ListTile(
                    title: Text(
                      'Phone',
                      style: poppinsSemiBold.copyWith(
                        color: Theme.of(context).primaryColor,
                        fontSize: Dimensions.fontSizeDefault,
                      ),
                    ),
                    subtitle: Text(userProfile!.phone),
                  ),
                  ListTile(
                    title: Text(
                      'Estate',
                      style: poppinsSemiBold.copyWith(
                        color: Theme.of(context).primaryColor,
                        fontSize: Dimensions.fontSizeDefault,
                      ),
                    ),
                    subtitle: Text(userProfile!.estate),
                  ),
                  ListTile(
                    title: Text(
                      'User Type',
                      style: poppinsSemiBold.copyWith(
                        color: Theme.of(context).primaryColor,
                        fontSize: Dimensions.fontSizeDefault,
                      ),
                    ),
                    subtitle: Text(userProfile!.usertype),
                  ),
                  ListTile(
                    title: Text(
                      'User Group',
                      style: poppinsSemiBold.copyWith(
                        color: Theme.of(context).primaryColor,
                        fontSize: Dimensions.fontSizeDefault,
                      ),
                    ),
                    subtitle: Text(userProfile!.userGroup),
                  ),
                  const SizedBox(height: 24),
                  // Delete Account Button
                  Center(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 32,
                          vertical: 12,
                        ),
                      ),
                      onPressed: _showDeleteConfirmation,
                      child: const Text('Delete Account'),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
