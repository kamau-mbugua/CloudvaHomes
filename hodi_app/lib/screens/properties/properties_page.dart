import 'package:flutter/material.dart';
import 'package:nb_utils/nb_utils.dart';
import 'package:provider/provider.dart';

import '../../models/data/properties/properties.dart';
import '../../providers/authenticated_app_providers.dart';
import '../../route/routes.dart';
import '../../utils/color_resources.dart';
import '../../utils/dimensions.dart';
import '../../utils/styles.dart';

class PropertiesPage extends StatefulWidget {
  @override
  _PropertiesPageState createState() => _PropertiesPageState();
}

class _PropertiesPageState extends State<PropertiesPage> {
  List<Property> properties = [];
  List<Property> filteredProperties = [];
  String selectedPropertyId = "";
  String selectedPropertyNames = "";
  TextEditingController searchController = TextEditingController();

  @override
  void initState() {
    Future.microtask(() => {
          fetchProperties(), // fetchHouses()
        });
    searchController.addListener(_onSearchChanged);
    super.initState();
  }

  void fetchProperties([String query = ""]) async {
    debugPrint(">>>>>>>>>fetchProperties<<<<<<<<<< and query is $query");
    List<Property> fetchedProperties =
        await Provider.of<AuthenticatedAppProviders>(context, listen: false)
            .getBusinessProperties("");

    setState(() {
      properties = fetchedProperties;
      filteredProperties = fetchedProperties;
    });
  }

  @override
  void dispose() {
    searchController.removeListener(_onSearchChanged);
    searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged() {
    setState(() {
      filteredProperties = properties.where((property) {
        return property.name
            .toLowerCase()
            .contains(searchController.text.toLowerCase());
      }).toList();
    });
  }

  Future<void> _refreshProperties() async {
    fetchProperties();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(
          'Properties',
          style: poppinsBold.copyWith(
            color: Theme.of(context).primaryColor,
            fontSize: Dimensions.fontSizeDefault,
          ),
        ),
        centerTitle: true,
        backgroundColor: Colors.white,
        leading: BackButton(
          color: Colors.black,
          onPressed: () {
            Navigator.pop(context);
          },
        ),
      ),
      body: Consumer<AuthenticatedAppProviders>(
          builder: (context, provider, child) {
        return provider.isLoading
            ? const Center(
                child: CircularProgressIndicator(),
              )
            : properties.isEmpty
                ? Center(
                    child: Text(
                      "No properties found",
                      style: poppinsRegular.copyWith(
                        color: ColorResources.colorNero,
                        fontSize: Dimensions.fontSizeDefault,
                      ),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _refreshProperties,
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            "Properties",
                            style: poppinsSemiBold.copyWith(
                              color: Theme.of(context).primaryColor,
                              fontSize: Dimensions.fontSizeDefault,
                            ),
                          ),
                          Text(
                            "Here is a list of your properties",
                            style: poppinsRegular.copyWith(
                              color: ColorResources.textGrey,
                              fontSize: Dimensions.fontSizeDefault,
                            ),
                          ).paddingBottom(16),
                          TextField(
                            controller: searchController,
                            decoration: InputDecoration(
                              filled: true,
                              fillColor: context.cardColor,
                              hintText: "Search",
                              hintStyle:
                                  primaryTextStyle(color: Colors.grey.shade400),
                              prefixIcon: Icon(
                                Icons.search_rounded,
                                color: Colors.grey.shade400,
                              ),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(15),
                                borderSide: BorderSide.none,
                              ),
                            ),
                          ).paddingOnly(bottom: 5, top: 10),
                          Wrap(
                            direction: Axis.vertical,
                            spacing: 5,
                            children: List.generate(filteredProperties.length,
                                (index) {
                              return GestureDetector(
                                onTap: () {
                                  setState(() {
                                    var propertyId =
                                        filteredProperties[index].id.toString();

                                    ValueNotifier<String> propertyIdNotifier =
                                        ValueNotifier<String>(propertyId);

                                    var isAppBar = true;
                                    Navigator.pushNamed(
                                      context,
                                      AppRoutes.getHousesPageRoute(),
                                      arguments: {
                                        'propertyIdNotifier': propertyIdNotifier,
                                        'isAppBar': isAppBar,
                                      },
                                    );

                                  });
                                },
                                child: Container(
                                  width: MediaQuery.of(context).size.width - 32,
                                  padding: EdgeInsets.all(20),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(10),
                                    color:
                                        Colors.grey[index % 2 == 0 ? 100 : 200],
                                    border: Border.all(color: Colors.white),
                                  ),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          properties[index].name,
                                          style: poppinsRegular.copyWith(
                                            color: ColorResources.colorBlack,
                                            fontSize:
                                                Dimensions.fontSizeDefault,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            }),
                          ),
                        ],
                      ),
                    ),
                  );
      }),
    );
  }
}
