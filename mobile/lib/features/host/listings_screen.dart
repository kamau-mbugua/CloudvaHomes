import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import 'calendar_rules.dart';
import 'calendar_widgets.dart' show CalChip;
import 'detail_ui.dart' show DetailPill;
import 'host_api.dart';
import 'host_models.dart';
import 'host_shell.dart';
import 'listing_photo.dart';
import 'listing_view.dart';

String _todayIso() => DateTime.now().toIso8601String().substring(0, 10);

/// How many listings a property shows before "Show all".
const _perGroup = 3;

/// Tonight and the next 30 days, per unit, from the calendar.
typedef _Occupancy = ({Set<String> bookedTonight, Map<String, int> booked30});

/// The Listings tab: every listing as a photo card or a compact row, grouped by property.
class ListingsScreen extends ConsumerStatefulWidget {
  const ListingsScreen({super.key});

  @override
  ConsumerState<ListingsScreen> createState() => _ListingsScreenState();
}

class _ListingsScreenState extends ConsumerState<ListingsScreen> {
  final _search = TextEditingController();
  ListingFilter _filter = ListingFilter.all;
  bool _cards = true;
  final Set<String> _expanded = {};
  late final String _today = _todayIso();
  Future<_Occupancy?>? _occupancy;

  @override
  void initState() {
    super.initState();
    _search.addListener(() => setState(() {}));
    _occupancy = _loadOccupancy();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  /// Best effort: without the calendar the cards just leave out tonight and occupancy.
  Future<_Occupancy?> _loadOccupancy() async {
    try {
      final cal = await ref
          .read(hostApiProvider)
          .calendar(from: _today, to: addDays(_today, 30));
      return (
        bookedTonight: {
          for (final u in cal.units)
            if (!freeTonight(cal.itemsFor(u.id), _today)) u.id,
        },
        booked30: {
          for (final u in cal.units)
            u.id: bookedNights(cal.itemsFor(u.id), _today, 30, _today),
        },
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> _refresh() async {
    setState(() => _occupancy = _loadOccupancy());
    ref.invalidate(hostListingsProvider);
    await ref.read(hostListingsProvider.future);
  }

  Future<void> _open(String path) async {
    await context.push(path);
    if (mounted) await _refresh();
  }

  Future<void> _setPublished(HostListing l, bool published) async {
    try {
      await ref.read(hostApiProvider).updateListing(l.id, {
        'published': published,
      });
      ref.invalidate(hostListingsProvider);
      if (mounted) {
        showMessage(
          context,
          published
              ? '${l.title} is live on your site.'
              : '${l.title} is hidden from your site.',
        );
      }
    } on ApiError catch (e) {
      if (mounted) showMessage(context, e.message);
    }
  }

  Future<void> _more(HostListing l, bool canUpdate) async {
    String? address;
    try {
      address = (await ref.read(hostSiteProvider.future)).address;
    } catch (_) {}
    if (!mounted) return;
    final url = publicListingUrl(address, l.id);
    final pick = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(
                l.title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            if (url != null && l.published) ...[
              ListTile(
                leading: const Icon(Icons.share_outlined),
                title: const Text('Share link'),
                subtitle: Text(shortUrl(url)),
                onTap: () => Navigator.of(ctx).pop('share'),
              ),
              ListTile(
                leading: const Icon(Icons.copy_outlined),
                title: const Text('Copy link'),
                onTap: () => Navigator.of(ctx).pop('copy'),
              ),
            ] else
              ListTile(
                leading: const Icon(Icons.link_off),
                title: const Text('No link to share yet'),
                subtitle: Text(
                  url == null
                      ? 'Set your booking site’s web address under More → Booking site.'
                      : 'Put the listing live on your site first.',
                ),
              ),
            if (canUpdate)
              ListTile(
                leading: Icon(
                  l.published
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined,
                ),
                title: Text(
                  l.published ? 'Hide from site' : 'Put live on site',
                ),
                subtitle: l.published
                    ? const Text('Bookings you already have stay.')
                    : null,
                onTap: () => Navigator.of(ctx).pop('toggle'),
              ),
          ],
        ),
      ),
    );
    if (!mounted || pick == null) return;
    switch (pick) {
      case 'share':
        await SharePlus.instance.share(
          ShareParams(uri: Uri.parse(url!), title: l.title),
        );
      case 'copy':
        await Clipboard.setData(ClipboardData(text: url!));
        if (mounted) showMessage(context, 'Link copied.');
      case 'toggle':
        await _setPublished(l, !l.published);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).value;
    final canCreate = session?.can('listings:create') ?? false;
    final canUpdate = session?.can('listings:update') ?? false;
    final async = ref.watch(hostListingsProvider);
    final count = async.valueOrNull?.length;

    return HostTabScaffold(
      title: 'Listings',
      subtitle: count == null ? null : '$count listing${count == 1 ? '' : 's'}',
      actions: [
        if (canCreate)
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: FilledButton(
              key: const Key('listing-add'),
              style: FilledButton.styleFrom(
                backgroundColor: HodiColors.lime,
                foregroundColor: HodiColors.navy,
                minimumSize: const Size(0, 36),
                padding: const EdgeInsets.symmetric(horizontal: 14),
              ),
              onPressed: () => _open('/host/listings/new'),
              child: const Text('+ Add listing'),
            ),
          ),
      ],
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(56),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          child: SizedBox(
            height: 44,
            child: TextField(
              controller: _search,
              style: const TextStyle(color: Colors.white, fontSize: 14),
              cursorColor: Colors.white,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Search by name or unit number',
                hintStyle: const TextStyle(
                  color: Color(0xFFC9D6E5),
                  fontSize: 14,
                ),
                prefixIcon: const Icon(
                  Icons.search,
                  color: Color(0xFFE6EDF5),
                  size: 18,
                ),
                filled: true,
                fillColor: Colors.white.withValues(alpha: 0.1),
                contentPadding: EdgeInsets.zero,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: HodiColors.lime),
                ),
              ),
            ),
          ),
        ),
      ),
      body: async.when(
        loading: () => const KodiHubSkeletonList(rows: 3),
        error: (e, _) => ErrorState(
          message: messageOf(e),
          onRetry: () => ref.invalidate(hostListingsProvider),
        ),
        data: (items) {
          if (items.isEmpty) {
            return const EmptyState(
              icon: Icons.bed_outlined,
              title: 'No listings yet',
              body:
                  'Add your first short-stay unit with photos and a nightly price.',
            );
          }
          return FutureBuilder<_Occupancy?>(
            future: _occupancy,
            builder: (context, snap) => _list(items, snap.data, canUpdate),
          );
        },
      ),
    );
  }

  Widget _list(List<HostListing> items, _Occupancy? occ, bool canUpdate) {
    bool free(HostListing l) =>
        !(occ?.bookedTonight.contains(l.unitId) ?? false);
    final searched = [
      for (final l in items)
        if (matchesSearch(l, _search.text)) l,
    ];
    final shown = [
      for (final l in searched)
        if (matchesFilter(l, _filter, freeTonight: free(l))) l,
    ];
    final narrowed =
        _filter != ListingFilter.all || _search.text.trim().isNotEmpty;

    final groups = <String, List<HostListing>>{};
    for (final l in shown) {
      groups.putIfAbsent(l.propertyName, () => []).add(l);
    }

    final chips = [
      (ListingFilter.all, 'All ${searched.length}'),
      if (occ != null)
        (
          ListingFilter.freeTonight,
          'Free tonight ${searched.where(free).length}',
        ),
      (
        ListingFilter.hidden,
        'Hidden ${searched.where((l) => !l.published).length}',
      ),
      (
        ListingFilter.noPhotos,
        'No photos ${searched.where((l) => l.photos.isEmpty).length}',
      ),
    ];

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
        children: [
          Row(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final (f, label) in chips) ...[
                        CalChip(
                          label: label,
                          selected: _filter == f,
                          onTap: () => setState(() => _filter = f),
                        ),
                        const SizedBox(width: 6),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              _ViewToggle(
                cards: _cards,
                onChanged: (v) => setState(() => _cards = v),
              ),
            ],
          ),
          if (shown.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 24),
              child: Text(
                _search.text.trim().isNotEmpty
                    ? 'No listing matches “${_search.text.trim()}”.'
                    : 'No listing matches this filter.',
                style: const TextStyle(color: HodiColors.inkMuted),
              ),
            ),
          for (final entry in groups.entries) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 18, 4, 10),
              child: Text(
                entry.key.toUpperCase(),
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.6,
                  color: HodiColors.inkMuted,
                ),
              ),
            ),
            for (final l
                in (narrowed || _expanded.contains(entry.key)
                    ? entry.value
                    : entry.value.take(_perGroup)))
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _cards
                    ? _ListingCard(
                        listing: l,
                        bookedTonight: occ == null ? null : !free(l),
                        booked30: occ?.booked30[l.unitId],
                        onEdit: () => _open('/host/listings/${l.id}'),
                        onCalendar: () =>
                            _open('/host/calendar/unit/${l.unitId}'),
                        onMore: () => _more(l, canUpdate),
                      )
                    : _ListingRow(
                        listing: l,
                        bookedTonight: occ == null ? null : !free(l),
                        onTap: () => _open('/host/listings/${l.id}'),
                      ),
              ),
            if (!narrowed &&
                !_expanded.contains(entry.key) &&
                entry.value.length > _perGroup)
              OutlinedButton(
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(44),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  side: const BorderSide(color: Color(0xFFCBD5E1)),
                ),
                onPressed: () => setState(() => _expanded.add(entry.key)),
                child: Text('Show all ${entry.value.length} in ${entry.key}'),
              ),
          ],
        ],
      ),
    );
  }
}

class _ViewToggle extends StatelessWidget {
  const _ViewToggle({required this.cards, required this.onChanged});

  final bool cards;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    Widget button(bool value, IconData icon, String label) => Semantics(
      button: true,
      selected: cards == value,
      label: label,
      child: Material(
        color: cards == value
            ? Theme.of(context).colorScheme.surface
            : Colors.transparent,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: () => onChanged(value),
          child: SizedBox(
            width: 36,
            height: 32,
            child: Icon(icon, size: 16, color: HodiColors.navy),
          ),
        ),
      ),
    );
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: const Color(0xFFEEF1F5),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          button(true, Icons.view_agenda_outlined, 'Photo cards'),
          button(false, Icons.view_list_outlined, 'Compact list'),
        ],
      ),
    );
  }
}

/// "Live on your site" / "Hidden" pill colours.
({String label, String tone}) _liveBadge(HostListing l) => l.published
    ? (label: 'Live on your site', tone: 'ok')
    : (label: 'Hidden', tone: 'warn');

({String label, String tone})? _tonightBadge(bool? booked) => booked == null
    ? null
    : booked
    ? (label: 'Booked tonight', tone: 'plain')
    : (label: 'Free tonight', tone: 'ok');

class _ListingCard extends StatelessWidget {
  const _ListingCard({
    required this.listing,
    required this.bookedTonight,
    required this.booked30,
    required this.onEdit,
    required this.onCalendar,
    required this.onMore,
  });

  final HostListing listing;
  final bool? bookedTonight;
  final int? booked30;
  final VoidCallback onEdit;
  final VoidCallback onCalendar;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    final l = listing;
    final cs = Theme.of(context).colorScheme;
    final live = _liveBadge(l);
    final tonight = _tonightBadge(bookedTonight);
    final occ = booked30 == null ? null : (booked30! * 100 / 30).round();
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: cs.surfaceContainerLowest,
        border: Border.all(color: cs.outlineVariant),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            button: true,
            label: 'Edit ${l.title}',
            child: InkWell(
              onTap: onEdit,
              child: SizedBox(
                height: 200,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (l.photos.isNotEmpty)
                      ListingPhotoImage(
                        uploadId: l.photos.first.uploadId,
                        width: 1024,
                        semanticLabel: 'Cover photo of ${l.title}',
                      )
                    else
                      Padding(
                        padding: const EdgeInsets.all(12),
                        child: _NoPhotos(onTap: onEdit),
                      ),
                    Positioned(
                      top: 12,
                      left: 12,
                      child: DetailPill(live.label, tone: live.tone),
                    ),
                    if (l.photos.isNotEmpty)
                      Positioned(
                        top: 12,
                        right: 12,
                        child: _DarkBadge(
                          icon: Icons.photo_camera_outlined,
                          label:
                              '${l.photos.length} photo${l.photos.length == 1 ? '' : 's'}',
                        ),
                      ),
                    Positioned(
                      left: 12,
                      bottom: 12,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          'Unit ${l.unitNumber}',
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: HodiColors.navy,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        l.title,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                          height: 1.25,
                        ),
                      ),
                    ),
                    if (tonight != null) ...[
                      const SizedBox(width: 8),
                      DetailPill(tonight.label, tone: tonight.tone),
                    ],
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  listingSpecs(l),
                  style: const TextStyle(
                    fontSize: 13,
                    color: HodiColors.inkMuted,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.end,
                  children: [
                    Text(
                      'KES ${shillingsOf(l.nightlyPrice)}',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      priceTail(l),
                      style: const TextStyle(
                        fontSize: 13,
                        color: HodiColors.inkMuted,
                      ),
                    ),
                  ],
                ),
                if (occ != null) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: Semantics(
                          label: '$occ percent booked in the next 30 days',
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(999),
                            child: LinearProgressIndicator(
                              value: occ / 100,
                              minHeight: 6,
                              color: HodiColors.lime,
                              backgroundColor: const Color(0xFFEDF1F5),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Flexible(
                        child: Text(
                          '$occ% booked, next 30 days',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12,
                            color: HodiColors.inkMuted,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(42),
                          side: const BorderSide(color: HodiColors.navy),
                        ),
                        onPressed: onEdit,
                        child: const Text('Edit'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(42),
                          side: const BorderSide(color: Color(0xFFCBD5E1)),
                        ),
                        onPressed: onCalendar,
                        child: const Text('Calendar'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 42,
                      height: 42,
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          padding: EdgeInsets.zero,
                          shape: const CircleBorder(),
                          side: const BorderSide(color: Color(0xFFCBD5E1)),
                        ),
                        onPressed: onMore,
                        child: Tooltip(
                          message: 'More for ${l.title}',
                          child: const Icon(Icons.more_horiz, size: 18),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NoPhotos extends StatelessWidget {
  const _NoPhotos({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: const Color(0xFFF1F4F8),
      border: Border.all(color: const Color(0xFF9AA8B8), width: 1.5),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(
          Icons.photo_camera_outlined,
          size: 28,
          color: HodiColors.inkSecondary,
        ),
        const SizedBox(height: 6),
        const Text(
          'No photos yet',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
        const Text(
          'Guests see a blank card on your site',
          style: TextStyle(fontSize: 12, color: HodiColors.inkSecondary),
        ),
        const SizedBox(height: 8),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 36)),
          onPressed: onTap,
          child: const Text('Add photos'),
        ),
      ],
    ),
  );
}

class _DarkBadge extends StatelessWidget {
  const _DarkBadge({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: const Color(0xC70A2540),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: Colors.white),
        const SizedBox(width: 6),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    ),
  );
}

class _ListingRow extends StatelessWidget {
  const _ListingRow({
    required this.listing,
    required this.bookedTonight,
    required this.onTap,
  });

  final HostListing listing;
  final bool? bookedTonight;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l = listing;
    final cs = Theme.of(context).colorScheme;
    final live = _liveBadge(l);
    final tonight = _tonightBadge(bookedTonight);
    return Material(
      color: cs.surfaceContainerLowest,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: cs.outlineVariant),
        borderRadius: BorderRadius.circular(14),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: SizedBox(
                  width: 84,
                  height: 64,
                  child: l.photos.isEmpty
                      ? Container(
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            border: Border.all(
                              color: const Color(0xFF9AA8B8),
                              width: 1.5,
                            ),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Text(
                            'No photo',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        )
                      : ListingPhotoImage(
                          uploadId: l.photos.first.uploadId,
                          width: 160,
                        ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${l.unitNumber} · KES ${shillingsOf(l.nightlyPrice)} a night',
                      style: const TextStyle(
                        fontSize: 12,
                        color: HodiColors.inkMuted,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        if (tonight != null)
                          DetailPill(tonight.label, tone: tonight.tone),
                        DetailPill(live.label, tone: live.tone),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
