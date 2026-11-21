import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'calendar_rules.dart';

/// Bar colours from the host calendar design: (background, text, border).
(Color, Color, Color?) spanColors(SpanKind k) => switch (k) {
  SpanKind.checkedIn => (HodiColors.navy, Colors.white, null),
  SpanKind.confirmed => (HodiColors.lime, HodiColors.ink, null),
  SpanKind.request => (
    const Color(0xFFEFF5FC),
    const Color(0xFF1D4F8C),
    const Color(0xFF1D4F8C),
  ),
  SpanKind.blocked => (const Color(0xFFD5DCE5), const Color(0xFF33465F), null),
  SpanKind.overdue => (const Color(0xFFB42318), Colors.white, null),
  SpanKind.past => (const Color(0xFF5D7590), Colors.white, null),
};

const dueDotColor = Color(0xFFF28C28);

String spanKindLabel(SpanKind k) => switch (k) {
  SpanKind.checkedIn => 'Checked in',
  SpanKind.confirmed => 'Confirmed',
  SpanKind.request => 'Request',
  SpanKind.blocked => 'Blocked',
  SpanKind.overdue => 'Overdue',
  SpanKind.past => 'Past stay',
};

/// One booking or block, drawn across the columns it covers.
class SpanBar extends StatelessWidget {
  const SpanBar({super.key, required this.span, this.showLabel = true});

  final CalSpan span;
  final bool showLabel;

  @override
  Widget build(BuildContext context) {
    final (bg, fg, border) = spanColors(span.kind);
    const r = Radius.circular(8);
    return Container(
      decoration: BoxDecoration(
        color: bg,
        border: border == null ? null : Border.all(color: border, width: 1.5),
        borderRadius: BorderRadius.only(
          topLeft: span.openLeft ? Radius.zero : r,
          bottomLeft: span.openLeft ? Radius.zero : r,
          topRight: span.openRight ? Radius.zero : r,
          bottomRight: span.openRight ? Radius.zero : r,
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 6),
      alignment: Alignment.centerLeft,
      child: Row(
        children: [
          if (span.due && showLabel) ...[
            Semantics(
              label: 'balance due',
              child: Container(
                width: 7,
                height: 7,
                decoration: const BoxDecoration(
                  color: dueDotColor,
                  shape: BoxShape.circle,
                ),
              ),
            ),
            const SizedBox(width: 4),
          ],
          if (showLabel)
            Flexible(
              child: Text(
                span.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                softWrap: false,
                style: TextStyle(
                  color: fg,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Lays bars out over [columns] equal columns.
class SpanRow extends StatelessWidget {
  const SpanRow({
    super.key,
    required this.spans,
    this.columns = 7,
    this.height = 30,
    this.barHeight,
    this.highlightColumn,
    this.highlightColor,
  });

  final List<CalSpan> spans;
  final int columns;
  final double height;

  /// Bars are centred at this height; the highlight still fills [height]. Defaults to [height].
  final double? barHeight;
  final int? highlightColumn;
  final Color? highlightColor;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, c) {
      final w = c.maxWidth / columns;
      final bar = barHeight ?? height;
      final inset = (height - bar) / 2;
      return SizedBox(
        height: height,
        child: Stack(
          children: [
            if (highlightColumn != null && highlightColor != null)
              Positioned(
                left: highlightColumn! * w,
                width: w,
                top: 0,
                bottom: 0,
                child: ColoredBox(color: highlightColor!),
              ),
            for (final s in spans)
              Positioned(
                left: s.start * w + (s.openLeft ? 0 : 2),
                width:
                    (s.end - s.start + 1) * w -
                    (s.openLeft ? 0 : 2) -
                    (s.openRight ? 0 : 2),
                top: inset,
                height: bar,
                child: SpanBar(span: s),
              ),
          ],
        ),
      );
    },
  );
}

/// A rounded on/off filter chip in the design's style.
class CalChip extends StatelessWidget {
  const CalChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    selected: selected,
    child: Material(
      color: selected ? HodiColors.navy : Theme.of(context).colorScheme.surface,
      shape: StadiumBorder(
        side: BorderSide(
          color: selected ? HodiColors.navy : const Color(0xFFCBD5E1),
        ),
      ),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: selected
                  ? Colors.white
                  : Theme.of(context).colorScheme.onSurface,
            ),
          ),
        ),
      ),
    ),
  );
}

/// The colour key under a calendar.
class SpanLegend extends StatelessWidget {
  const SpanLegend({super.key, required this.kinds, this.showToday = false});

  final List<SpanKind> kinds;
  final bool showToday;

  @override
  Widget build(BuildContext context) {
    const style = TextStyle(fontSize: 11, color: HodiColors.inkSecondary);
    Widget item(Widget swatch, String label) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        swatch,
        const SizedBox(width: 6),
        Text(label, style: style),
      ],
    );
    return Wrap(
      spacing: 14,
      runSpacing: 6,
      children: [
        for (final k in kinds)
          item(
            Container(
              width: 14,
              height: 10,
              decoration: BoxDecoration(
                color: spanColors(k).$1,
                border: spanColors(k).$3 == null
                    ? null
                    : Border.all(color: spanColors(k).$3!, width: 1.5),
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            spanKindLabel(k),
          ),
        if (showToday)
          item(
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: HodiColors.lime, width: 2),
              ),
            ),
            'Today',
          ),
        item(
          Container(
            width: 7,
            height: 7,
            decoration: const BoxDecoration(
              color: dueDotColor,
              shape: BoxShape.circle,
            ),
          ),
          'Balance due',
        ),
      ],
    );
  }
}

/// Round outlined icon button used for week / month paging.
class PageArrow extends StatelessWidget {
  const PageArrow({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 40,
    height: 40,
    child: OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        padding: EdgeInsets.zero,
        shape: const CircleBorder(),
        side: const BorderSide(color: Color(0xFFE3E8EF)),
      ),
      child: Tooltip(message: tooltip, child: Icon(icon, size: 18)),
    ),
  );
}

/// The "Today" pill beside the paging arrows.
class TodayButton extends StatelessWidget {
  const TodayButton({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 40,
    child: OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        shape: const StadiumBorder(),
        side: const BorderSide(color: Color(0xFFE3E8EF)),
      ),
      child: const Text(
        'Today',
        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
      ),
    ),
  );
}
