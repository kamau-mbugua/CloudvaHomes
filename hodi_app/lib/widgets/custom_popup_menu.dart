import 'package:flutter/material.dart';

class CustomPopupMenu extends StatelessWidget {
  final Function(String) onSelected;
  final List<PopupMenuItem<String>> menuItems;
  final GlobalKey key;


  CustomPopupMenu({
    required this.key,
    required this.onSelected,
    required this.menuItems});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(
        Icons.more_vert,
        color: Colors.black,
      ),
      onPressed: () {
        final RenderBox renderBox = key.currentContext!.findRenderObject() as RenderBox;
        final position = renderBox.localToGlobal(Offset.zero);
        final size = renderBox.size;

        showMenu(
          context: context,
          position: RelativeRect.fromLTRB(
            position.dx,
            position.dy + size.height,
            position.dx + size.width,
            position.dy,
          ),
          items: menuItems,
        ).then((value) {
          if (value != null) {
            onSelected(value);
          }
        });
      },
    );
  }
}