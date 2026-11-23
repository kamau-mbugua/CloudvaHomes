import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import '../staff/staff_widgets.dart';
import 'detail_ui.dart' show DetailCard;
import 'host_api.dart';
import 'host_models.dart';
import 'listing_photo.dart';
import 'listing_view.dart';

const _maxPhotos = 20;
const _descriptionMax = 4000;

/// Create or edit a listing (KodiHQ "Edit listing · mobile"): photos, about, price, space and
/// stay rules, amenities, check-in instructions, booking rules and whether it is live.
class ListingEditorScreen extends ConsumerStatefulWidget {
  const ListingEditorScreen({super.key, this.listingId});
  final String? listingId;

  @override
  ConsumerState<ListingEditorScreen> createState() =>
      _ListingEditorScreenState();
}

class _ListingEditorScreenState extends ConsumerState<ListingEditorScreen> {
  final _unitNumber = TextEditingController();
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _area = TextEditingController();
  final _checkInInstructions = TextEditingController();
  final _nightlyPrice = TextEditingController(text: '2500');
  final _weekendPrice = TextEditingController();
  final _cleaningFee = TextEditingController(text: '0');

  int _bedrooms = 1;
  int _bathrooms = 1;
  int _maxGuests = 2;
  int _minNights = 1;
  int? _maxNights;
  String? _checkInFrom;
  String? _checkOutBy;

  String _propertyId = '';
  List<({String id, String code, String name})> _properties = const [];
  final Set<String> _amenities = <String>{};
  bool _published = false;
  bool _useDefaultRules = true;
  String _bookingMode = 'INSTANT';
  String _paymentKind = 'FULL_UPFRONT';
  String _cancelKind = 'MODERATE';

  HostListing? _loaded;
  List<ListingPhoto> _photos = const [];
  String? _siteAddress;
  bool _loading = true;
  bool _saving = false;
  bool _photoBusy = false;
  String? _error;
  Map<String, String> _fieldErrors = const {};

  /// The form as last loaded or saved, to tell whether anything changed.
  String _baseline = '';

  bool get _isNew => widget.listingId == null || widget.listingId == 'new';

  @override
  void initState() {
    super.initState();
    for (final c in [
      _unitNumber,
      _title,
      _description,
      _area,
      _checkInInstructions,
      _nightlyPrice,
      _weekendPrice,
      _cleaningFee,
    ]) {
      c.addListener(_changed);
    }
    _load();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _unitNumber.dispose();
    _title.dispose();
    _description.dispose();
    _area.dispose();
    _checkInInstructions.dispose();
    _nightlyPrice.dispose();
    _weekendPrice.dispose();
    _cleaningFee.dispose();
    super.dispose();
  }

  /// Every value the host can change, as text; equal snapshots mean nothing changed.
  String _snapshot() => jsonEncode([
    _propertyId,
    _unitNumber.text,
    _title.text,
    _description.text,
    _area.text,
    _checkInInstructions.text,
    _nightlyPrice.text,
    _weekendPrice.text,
    _cleaningFee.text,
    _bedrooms,
    _bathrooms,
    _maxGuests,
    _minNights,
    _maxNights,
    _checkInFrom,
    _checkOutBy,
    (_amenities.toList()..sort()),
    _published,
    _useDefaultRules,
    _bookingMode,
  ]);

  bool get _dirty => !_loading && _snapshot() != _baseline;

  void _apply(HostListing? item) {
    if (item == null) return;
    _propertyId = item.propertyId;
    _unitNumber.text = item.unitNumber;
    _title.text = item.title;
    _description.text = item.description ?? '';
    _area.text = item.area ?? '';
    _checkInInstructions.text = item.checkInInstructions ?? '';
    _nightlyPrice.text = fromHostMinor(item.nightlyPrice);
    _weekendPrice.text = item.weekendPrice != null
        ? fromHostMinor(item.weekendPrice!)
        : '';
    _cleaningFee.text = fromHostMinor(item.cleaningFee);
    _bedrooms = item.bedrooms;
    _bathrooms = item.bathrooms;
    _maxGuests = item.maxGuests;
    _minNights = item.minNights;
    _maxNights = item.maxNights;
    _checkInFrom = item.checkInFrom;
    _checkOutBy = item.checkOutBy;
    _amenities
      ..clear()
      ..addAll(item.amenities);
    _published = item.published;
    _useDefaultRules = item.rulesOverride == null;
    if (item.rulesOverride != null) {
      _bookingMode = item.rulesOverride!.bookingMode;
      _paymentKind = item.rulesOverride!.payment.kind;
      _cancelKind = item.rulesOverride!.cancellation.kind;
    }
    _photos = item.photos;
  }

  Future<void> _load() async {
    final sessionProps =
        ref.read(sessionProvider).valueOrNull?.properties ?? const [];
    var props = [
      for (final p in sessionProps) (id: p.id, code: p.code, name: p.name),
    ];
    // Editing needs the listing; only a new listing needs the property list.
    try {
      if (!_isNew) {
        _loaded = await ref.read(hostApiProvider).listing(widget.listingId!);
        _apply(_loaded);
      } else if (props.isEmpty) {
        props = await ref.read(hostApiProvider).properties();
      }
    } on ApiError catch (e) {
      _error = e.message;
    }
    try {
      _siteAddress = (await ref.read(hostSiteProvider.future)).address;
    } catch (_) {
      // The link and Preview are extras; the editor works without them.
    }
    if (!mounted) return;
    setState(() {
      _properties = props;
      if (_propertyId.isEmpty && props.isNotEmpty) _propertyId = props.first.id;
      _loading = false;
      _baseline = _snapshot();
    });
  }

  void _discard() {
    setState(() {
      _apply(_loaded);
      _fieldErrors = const {};
      _error = null;
    });
  }

  Future<void> _save() async {
    final errors = <String, String>{};
    if (_isNew && _propertyId.isEmpty) {
      errors['propertyId'] = 'Choose a property';
    }
    if (_isNew && _unitNumber.text.trim().isEmpty) {
      errors['unitNumber'] = 'Enter a unit number';
    }
    if (_title.text.trim().isEmpty) errors['title'] = 'Enter a listing title';

    final nightlyMinor = toHostMinorString(_nightlyPrice.text);
    if (nightlyMinor == null) errors['nightlyPrice'] = 'Use whole shillings';
    String? weekendMinor;
    if (_weekendPrice.text.trim().isNotEmpty) {
      weekendMinor = toHostMinorString(_weekendPrice.text);
      if (weekendMinor == null) errors['weekendPrice'] = 'Use whole shillings';
    }
    final cleaningMinor = toHostMinorString(
      _cleaningFee.text.trim().isEmpty ? '0' : _cleaningFee.text,
      allowZero: true,
    );
    if (cleaningMinor == null) errors['cleaningFee'] = 'Use whole shillings';

    setState(() {
      _fieldErrors = errors;
      _error = errors.isEmpty ? null : 'Check the highlighted fields.';
    });
    if (errors.isNotEmpty) return;

    final rulesOverride = _useDefaultRules
        ? null
        : StayRules(
            bookingMode: _bookingMode,
            payment: StayPaymentRule(kind: _paymentKind),
            cancellation: StayCancelRule(kind: _cancelKind),
          ).toJson();

    String? text(TextEditingController c) =>
        c.text.trim().isEmpty ? null : c.text.trim();
    final payload = <String, Object?>{
      if (_isNew) 'propertyId': _propertyId,
      if (_isNew) 'unitNumber': _unitNumber.text.trim(),
      'title': _title.text.trim(),
      'description': text(_description),
      'area': text(_area),
      'checkInInstructions': text(_checkInInstructions),
      'bedrooms': _bedrooms,
      'bathrooms': _bathrooms,
      'maxGuests': _maxGuests,
      'minNights': _minNights,
      'maxNights': _maxNights,
      'checkInFrom': _checkInFrom,
      'checkOutBy': _checkOutBy,
      'nightlyPrice': nightlyMinor,
      'weekendPrice': weekendMinor,
      'cleaningFee': cleaningMinor,
      'amenities': _amenities.toList(),
      'published': _published,
      'rulesOverride': rulesOverride,
    };

    setState(() => _saving = true);
    try {
      final api = ref.read(hostApiProvider);
      if (_isNew) {
        final created = await api.createListing(payload);
        ref.invalidate(hostListingsProvider);
        if (mounted) {
          showMessage(context, 'Listing created. Now add photos.');
          if (GoRouter.maybeOf(context) != null) {
            context.go('/host/listings/${created.id}');
          }
        }
      } else {
        final updated = await api.updateListing(widget.listingId!, payload);
        ref.invalidate(hostListingsProvider);
        if (mounted) {
          setState(() {
            _loaded = updated;
            _baseline = _snapshot();
          });
          showMessage(context, 'Listing saved.');
        }
      }
    } on ApiError catch (e) {
      if (mounted) {
        setState(() {
          _fieldErrors = e.fieldErrors;
          _error = e.message;
        });
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _refreshPhotos() async {
    final refreshed = await ref.read(hostApiProvider).listing(_loaded!.id);
    if (mounted) setState(() => _photos = refreshed.photos);
    ref.invalidate(hostListingsProvider);
  }

  Future<void> _addPhotos() async {
    if (_loaded == null) return;
    final picked = await pickHostPhotos(
      context,
      limit: photosRoomLeft(_photos.length),
    );
    if (picked.isEmpty) return;
    setState(() => _photoBusy = true);
    var added = 0;
    var failed = 0;
    try {
      // One after another; a failed photo doesn't stop the rest.
      for (final bytes in picked) {
        try {
          await ref
              .read(hostApiProvider)
              .uploadListingPhoto(_loaded!.id, bytes);
          added += 1;
        } on ApiError {
          failed += 1;
        }
      }
      await _refreshPhotos();
    } on ApiError catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
    if (mounted) {
      showMessage(
        context,
        photoUploadMessage(added: added, failed: failed, skipped: 0),
      );
    }
  }

  Future<void> _reorder(List<String> ids, String done) async {
    setState(() => _photoBusy = true);
    try {
      final photos = await ref
          .read(hostApiProvider)
          .reorderListingPhotos(_loaded!.id, ids);
      if (mounted) setState(() => _photos = photos);
      ref.invalidate(hostListingsProvider);
      if (mounted) showMessage(context, done);
    } on ApiError catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  Future<void> _deletePhoto(ListingPhoto p) async {
    setState(() => _photoBusy = true);
    try {
      await ref.read(hostApiProvider).deleteListingPhoto(_loaded!.id, p.id);
      await _refreshPhotos();
      if (mounted) showMessage(context, 'Photo removed.');
    } on ApiError catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  /// A photo's actions: make it the cover, move it, or delete it.
  Future<void> _photoActions(int index) async {
    final ids = [for (final p in _photos) p.id];
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
                index == 0 ? 'Cover photo' : 'Photo ${index + 1}',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            if (index > 0)
              ListTile(
                leading: const Icon(Icons.star_outline),
                title: const Text('Make it the cover'),
                onTap: () => Navigator.of(ctx).pop('cover'),
              ),
            if (index > 0)
              ListTile(
                leading: const Icon(Icons.arrow_back),
                title: const Text('Move earlier'),
                onTap: () => Navigator.of(ctx).pop('earlier'),
              ),
            if (index < _photos.length - 1)
              ListTile(
                leading: const Icon(Icons.arrow_forward),
                title: const Text('Move later'),
                onTap: () => Navigator.of(ctx).pop('later'),
              ),
            ListTile(
              leading: Icon(
                Icons.delete_outline,
                color: Theme.of(ctx).colorScheme.error,
              ),
              title: Text(
                'Delete photo',
                style: TextStyle(color: Theme.of(ctx).colorScheme.error),
              ),
              onTap: () => Navigator.of(ctx).pop('delete'),
            ),
          ],
        ),
      ),
    );
    if (!mounted || pick == null) return;
    switch (pick) {
      case 'cover':
        final id = ids.removeAt(index);
        await _reorder([id, ...ids], 'Cover photo changed.');
      case 'earlier':
        final id = ids.removeAt(index);
        ids.insert(index - 1, id);
        await _reorder(ids, 'Photo moved.');
      case 'later':
        final id = ids.removeAt(index);
        ids.insert(index + 1, id);
        await _reorder(ids, 'Photo moved.');
      case 'delete':
        await _deletePhoto(_photos[index]);
    }
  }

  /// "Change cover": pick any photo to put first.
  Future<void> _changeCover() async {
    final chosen = await showModalBottomSheet<int>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Choose the cover',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              GridView.count(
                shrinkWrap: true,
                crossAxisCount: 3,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                children: [
                  for (var i = 1; i < _photos.length; i++)
                    InkWell(
                      onTap: () => Navigator.of(ctx).pop(i),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: ListingPhotoImage(
                          uploadId: _photos[i].uploadId,
                          width: 480,
                          semanticLabel: 'Photo ${i + 1}',
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (chosen == null || !mounted) return;
    final ids = [for (final p in _photos) p.id];
    final id = ids.removeAt(chosen);
    await _reorder([id, ...ids], 'Cover photo changed.');
  }

  String? get _publicUrl =>
      _loaded == null ? null : publicListingUrl(_siteAddress, _loaded!.id);

  @override
  Widget build(BuildContext context) {
    final canEdit = _isNew
        ? can(ref, 'listings:create')
        : can(ref, 'listings:update');
    final propertyName =
        _loaded?.propertyName ??
        _properties
            .where((p) => p.id == _propertyId)
            .map((p) => p.name)
            .firstOrNull;
    final subtitle = _isNew
        ? null
        : [
            ?propertyName,
            if (_unitNumber.text.trim().isNotEmpty)
              'Unit ${_unitNumber.text.trim()}',
          ].join(' · ');
    final previewUrl = _publicUrl;

    return Scaffold(
      appBar: KodiHubAppBar(
        title: Text(
          _isNew ? 'New listing' : (_loaded?.title ?? 'Listing'),
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: subtitle,
        loading: _photoBusy,
        actions: [
          if (previewUrl != null && (_loaded?.published ?? false))
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  minimumSize: const Size(0, 36),
                  side: BorderSide(color: Colors.white.withValues(alpha: 0.4)),
                ),
                onPressed: () => launchOrSay(context, Uri.parse(previewUrl)),
                child: const Text('Preview'),
              ),
            ),
        ],
      ),
      bottomNavigationBar: !_loading && canEdit ? _saveBar() : null,
      body: _loading
          ? const KodiHubSkeletonList(rows: 4)
          : ListView(
              padding: const EdgeInsets.fromLTRB(12, 14, 12, 24),
              children: [
                if (_error != null) ...[
                  ErrorBox(_error!),
                  const SizedBox(height: 12),
                ],
                _photosCard(canEdit),
                const SizedBox(height: 14),
                _aboutCard(canEdit),
                const SizedBox(height: 14),
                _priceCard(canEdit),
                const SizedBox(height: 14),
                _spaceCard(canEdit),
                const SizedBox(height: 14),
                _amenitiesCard(canEdit),
                const SizedBox(height: 14),
                DetailCard(
                  title: 'Check-in instructions',
                  gap: 10,
                  children: [
                    TextField(
                      controller: _checkInInstructions,
                      enabled: canEdit,
                      maxLines: 3,
                      minLines: 3,
                      decoration: const InputDecoration(
                        hintText: 'e.g. Call the caretaker at the gate',
                      ),
                    ),
                    const Text(
                      'Gate or key details, parking, who to call. Only guests with a confirmed booking see this.',
                      style: TextStyle(
                        fontSize: 12,
                        color: HodiColors.inkMuted,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                _rulesCard(canEdit),
                const SizedBox(height: 14),
                _liveCard(canEdit),
              ],
            ),
    );
  }

  Widget _saveBar() {
    final dirty = _dirty;
    final cs = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: cs.surfaceContainerLowest,
        border: Border(top: BorderSide(color: cs.outlineVariant)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Expanded(
                child: _isNew
                    ? const SizedBox.shrink()
                    : Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: dirty
                                  ? const Color(0xFFE8A33D)
                                  : HodiColors.lime,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Flexible(
                            child: Text(
                              dirty ? 'Unsaved changes' : 'All changes saved',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                color: dirty
                                    ? const Color(0xFF8A4B00)
                                    : HodiColors.inkMuted,
                              ),
                            ),
                          ),
                        ],
                      ),
              ),
              if (dirty && !_isNew) ...[
                SizedBox(
                  height: 48,
                  child: OutlinedButton(
                    onPressed: _saving ? null : _discard,
                    child: const Text('Discard'),
                  ),
                ),
                const SizedBox(width: 10),
              ],
              SizedBox(
                height: 48,
                child: FilledButton(
                  key: const Key('listing-save'),
                  // The theme's buttons fill the width; in this row the button sizes to its label.
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(0, 48),
                    padding: const EdgeInsets.symmetric(horizontal: 22),
                  ),
                  onPressed: _saving || (!_isNew && !dirty) ? null : _save,
                  child: KodiHubButtonChild(
                    loading: _saving,
                    label: _isNew ? 'Create listing' : 'Save',
                    loadingLabel: 'Saving…',
                    tone: SpinnerTone.navy,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _photosCard(bool canEdit) {
    if (_isNew) {
      return const DetailCard(
        title: 'Photos',
        children: [
          Text(
            'Create the listing first, then add up to 20 photos. The first one is the cover.',
            style: TextStyle(fontSize: 13, color: HodiColors.inkMuted),
          ),
        ],
      );
    }
    final cover = _photos.isEmpty ? null : _photos.first;
    final canAdd = canEdit && _photos.length < _maxPhotos;
    return DetailCard(
      title: 'Photos',
      trailing: Text(
        '${_photos.length} of $_maxPhotos',
        style: const TextStyle(fontSize: 13, color: HodiColors.inkMuted),
      ),
      gap: 12,
      children: [
        if (cover == null)
          InkWell(
            onTap: canAdd && !_photoBusy ? _addPhotos : null,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              height: 180,
              decoration: BoxDecoration(
                color: const Color(0xFFF1F4F8),
                border: Border.all(color: const Color(0xFF9AA8B8), width: 1.5),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.add_a_photo_outlined,
                    size: 28,
                    color: HodiColors.inkSecondary,
                  ),
                  SizedBox(height: 8),
                  Text(
                    'No photos yet',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  Text(
                    'Guests see a blank card on your site',
                    style: TextStyle(
                      fontSize: 12,
                      color: HodiColors.inkSecondary,
                    ),
                  ),
                ],
              ),
            ),
          )
        else
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              height: 252,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ListingPhotoImage(
                    uploadId: cover.uploadId,
                    width: 1024,
                    semanticLabel: 'Cover photo',
                  ),
                  Positioned(
                    top: 10,
                    left: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: HodiColors.lime,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text(
                        'Cover',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: HodiColors.navy,
                        ),
                      ),
                    ),
                  ),
                  if (canEdit && _photos.length > 1)
                    Positioned(
                      right: 10,
                      bottom: 10,
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xCC0A2540),
                          foregroundColor: Colors.white,
                          minimumSize: const Size(0, 36),
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                        ),
                        onPressed: _photoBusy ? null : _changeCover,
                        child: const Text(
                          'Change cover',
                          style: TextStyle(fontSize: 12),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        if (_photos.length > 1 || canAdd)
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 4,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 80 / 62,
            children: [
              for (var i = 1; i < _photos.length; i++)
                Semantics(
                  button: canEdit,
                  label: 'Photo ${i + 1}',
                  child: InkWell(
                    onTap: canEdit && !_photoBusy
                        ? () => _photoActions(i)
                        : null,
                    borderRadius: BorderRadius.circular(10),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          ListingPhotoImage(
                            uploadId: _photos[i].uploadId,
                            width: 160,
                          ),
                          Positioned(
                            left: 4,
                            bottom: 4,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 5,
                                vertical: 1,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.9),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                '${i + 1}',
                                style: const TextStyle(
                                  fontFamily: 'monospace',
                                  fontSize: 10,
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
              if (canAdd)
                InkWell(
                  key: const Key('listing-add-photos'),
                  onTap: _photoBusy ? null : _addPhotos,
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFFFAFAF7),
                      border: Border.all(
                        color: const Color(0xFF9AA8B8),
                        width: 1.5,
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.add, size: 18, color: HodiColors.navy),
                        Text(
                          _photoBusy ? 'Uploading…' : 'Add',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: HodiColors.navy,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        if (canEdit)
          Text(
            _photos.isEmpty
                ? 'Landscape photos at least 1200 px wide look best.'
                : 'Tap a photo to make it the cover, move it or delete it. The first photo is the cover. Landscape photos at least 1200 px wide look best.',
            style: const TextStyle(
              fontSize: 12,
              color: HodiColors.inkMuted,
              height: 1.45,
            ),
          ),
      ],
    );
  }

  Widget _aboutCard(bool canEdit) => DetailCard(
    title: 'About the place',
    gap: 12,
    children: [
      if (_isNew) ...[
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: _propertyId.isEmpty ? null : _propertyId,
          decoration: InputDecoration(
            labelText: 'Property',
            errorText: _fieldErrors['propertyId'],
          ),
          items: [
            for (final p in _properties)
              DropdownMenuItem(
                value: p.id,
                child: Text('${p.name} (${p.code})'),
              ),
          ],
          onChanged: canEdit
              ? (v) => setState(() => _propertyId = v ?? '')
              : null,
        ),
        TextField(
          key: const Key('listing-unit-number'),
          controller: _unitNumber,
          enabled: canEdit,
          decoration: InputDecoration(
            labelText: 'Unit number',
            hintText: 'e.g. A1',
            errorText: _fieldErrors['unitNumber'],
          ),
        ),
      ],
      TextField(
        key: const Key('listing-title'),
        controller: _title,
        enabled: canEdit,
        maxLength: 120,
        decoration: InputDecoration(
          labelText: 'Listing title',
          hintText: 'e.g. Sea Breeze Studio',
          counterText: '',
          errorText: _fieldErrors['title'],
        ),
      ),
      TextField(
        controller: _area,
        enabled: canEdit,
        decoration: InputDecoration(
          labelText: 'Area',
          hintText: 'e.g. Kileleshwa',
          errorText: _fieldErrors['area'],
        ),
      ),
      TextField(
        controller: _description,
        enabled: canEdit,
        maxLines: 4,
        minLines: 4,
        maxLength: _descriptionMax,
        decoration: InputDecoration(
          labelText: 'Description',
          helperText:
              'Say what makes it special: view, security, distance to town.',
          errorText: _fieldErrors['description'],
        ),
      ),
    ],
  );

  int? _shillings(TextEditingController c) {
    final t = c.text.replaceAll(',', '').trim();
    if (t.isEmpty) return null;
    return int.tryParse(t);
  }

  Widget _money(
    String label,
    TextEditingController c,
    String field,
    bool canEdit, {
    Key? key,
    String? hint,
  }) => TextField(
    key: key,
    controller: c,
    enabled: canEdit,
    keyboardType: const TextInputType.numberWithOptions(decimal: true),
    decoration: InputDecoration(
      labelText: label,
      prefixText: 'KES ',
      hintText: hint,
      errorText: _fieldErrors[field],
    ),
  );

  Widget _priceCard(bool canEdit) {
    final example = priceExample(
      nightly: _shillings(_nightlyPrice),
      weekend: _shillings(_weekendPrice),
      cleaning: _shillings(_cleaningFee) ?? 0,
    );
    return DetailCard(
      title: 'Price',
      gap: 12,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _money(
                'Sun to Thu nights',
                _nightlyPrice,
                'nightlyPrice',
                canEdit,
                key: const Key('listing-nightly-price'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _money(
                'Fri and Sat nights',
                _weekendPrice,
                'weekendPrice',
                canEdit,
                hint: 'Same',
              ),
            ),
          ],
        ),
        _money('Cleaning fee, per stay', _cleaningFee, 'cleaningFee', canEdit),
        if (example != null)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF3F8E6),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              example,
              style: const TextStyle(
                fontSize: 13,
                height: 1.45,
                color: HodiColors.inkSecondary,
              ),
            ),
          ),
      ],
    );
  }

  Widget _spaceCard(bool canEdit) {
    final rows = <Widget>[
      _Stepper(
        label: 'Bedrooms',
        hint: _bedrooms == 0 ? 'A studio' : null,
        value: '$_bedrooms',
        onDec: canEdit && _bedrooms > 0
            ? () => setState(() => _bedrooms--)
            : null,
        onInc: canEdit && _bedrooms < 30
            ? () => setState(() => _bedrooms++)
            : null,
      ),
      _Stepper(
        label: 'Bathrooms',
        value: '$_bathrooms',
        onDec: canEdit && _bathrooms > 1
            ? () => setState(() => _bathrooms--)
            : null,
        onInc: canEdit && _bathrooms < 30
            ? () => setState(() => _bathrooms++)
            : null,
      ),
      _Stepper(
        label: 'Guests',
        hint: 'Most people who can stay',
        value: '$_maxGuests',
        onDec: canEdit && _maxGuests > 1
            ? () => setState(() => _maxGuests--)
            : null,
        onInc: canEdit && _maxGuests < 50
            ? () => setState(() => _maxGuests++)
            : null,
      ),
      _Stepper(
        label: 'Shortest stay',
        hint: 'Nights',
        value: '$_minNights',
        onDec: canEdit && _minNights > 1
            ? () => setState(() => _minNights--)
            : null,
        onInc: canEdit && _minNights < (_maxNights ?? 365)
            ? () => setState(() => _minNights++)
            : null,
      ),
      _Stepper(
        label: 'Longest stay',
        hint: _maxNights == null ? 'No limit' : 'Nights',
        value: _maxNights == null ? '–' : '$_maxNights',
        // From "no limit", either button starts at 30 nights (or the shortest stay).
        onDec: !canEdit
            ? null
            : _maxNights == null
            ? () =>
                  setState(() => _maxNights = _minNights > 30 ? _minNights : 30)
            : _maxNights! > _minNights
            ? () => setState(() => _maxNights = _maxNights! - 1)
            : null,
        onInc: !canEdit
            ? null
            : _maxNights == null
            ? () =>
                  setState(() => _maxNights = _minNights > 30 ? _minNights : 30)
            : _maxNights! < 365
            ? () => setState(() => _maxNights = _maxNights! + 1)
            : null,
        extra: canEdit && _maxNights != null
            ? TextButton(
                onPressed: () => setState(() => _maxNights = null),
                child: const Text('No limit'),
              )
            : null,
      ),
    ];
    return DetailCard(
      title: 'Space and stay rules',
      gap: 0,
      children: [
        const SizedBox(height: 6),
        for (var i = 0; i < rows.length; i++)
          Container(
            decoration: i == 0
                ? null
                : const BoxDecoration(
                    border: Border(top: BorderSide(color: Color(0xFFEEF1F5))),
                  ),
            child: rows[i],
          ),
        if (_fieldErrors['maxNights'] != null)
          Text(
            _fieldErrors['maxNights']!,
            style: TextStyle(
              color: Theme.of(context).colorScheme.error,
              fontSize: 12,
            ),
          ),
        Container(
          padding: const EdgeInsets.only(top: 12),
          decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: Color(0xFFEEF1F5))),
          ),
          child: Row(
            children: [
              Expanded(
                child: _timeField('Check-in from', _checkInFrom, canEdit, (v) {
                  setState(() => _checkInFrom = v);
                }),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _timeField('Check-out by', _checkOutBy, canEdit, (v) {
                  setState(() => _checkOutBy = v);
                }),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _timeField(
    String label,
    String? value,
    bool canEdit,
    ValueChanged<String?> onChanged,
  ) {
    final choices = [
      ...stayTimeChoices,
      if (value != null && !stayTimeChoices.contains(value)) value,
    ];
    return DropdownButtonFormField<String?>(
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: [
        const DropdownMenuItem<String?>(value: null, child: Text('Not set')),
        for (final t in choices)
          DropdownMenuItem<String?>(value: t, child: Text(t)),
      ],
      onChanged: canEdit ? onChanged : null,
    );
  }

  Widget _amenitiesCard(bool canEdit) {
    final all = [
      ...commonHostAmenities,
      for (final a in _amenities)
        if (!commonHostAmenities.contains(a)) a,
    ];
    return DetailCard(
      title: 'Amenities',
      trailing: Text(
        '${_amenities.length} selected',
        style: const TextStyle(fontSize: 13, color: HodiColors.inkMuted),
      ),
      gap: 12,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final a in all)
              FilterChip(
                label: Text(a),
                selected: _amenities.contains(a),
                onSelected: canEdit
                    ? (sel) => setState(() {
                        if (sel) {
                          _amenities.add(a);
                        } else {
                          _amenities.remove(a);
                        }
                      })
                    : null,
              ),
          ],
        ),
      ],
    );
  }

  Widget _rulesCard(bool canEdit) => DetailCard(
    title: 'Booking rules',
    gap: 8,
    children: [
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('Use my default booking rules'),
        subtitle: const Text('Set under More → Booking site.'),
        value: _useDefaultRules,
        onChanged: canEdit ? (v) => setState(() => _useDefaultRules = v) : null,
      ),
      if (!_useDefaultRules)
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: _bookingMode,
          decoration: const InputDecoration(labelText: 'How guests book'),
          items: const [
            DropdownMenuItem(value: 'INSTANT', child: Text('Instant booking')),
            DropdownMenuItem(value: 'REQUEST', child: Text('Request to book')),
          ],
          onChanged: canEdit
              ? (v) => setState(() => _bookingMode = v ?? 'INSTANT')
              : null,
        ),
    ],
  );

  Widget _liveCard(bool canEdit) {
    final url = _publicUrl;
    return DetailCard(
      gap: 10,
      children: [
        SwitchListTile(
          key: const Key('listing-live'),
          contentPadding: EdgeInsets.zero,
          title: const Text(
            'Live on your booking site',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
          subtitle: const Text('Hiding it keeps bookings you already have.'),
          value: _published,
          onChanged: canEdit ? (v) => setState(() => _published = v) : null,
        ),
        if (url != null)
          InkWell(
            onTap: () => launchOrSay(context, Uri.parse(url)),
            child: Text(
              shortUrl(url),
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 12,
                color: HodiColors.limeText,
              ),
            ),
          ),
      ],
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.label,
    this.hint,
    required this.value,
    required this.onDec,
    required this.onInc,
    this.extra,
  });

  final String label;
  final String? hint;
  final String value;
  final VoidCallback? onDec;
  final VoidCallback? onInc;
  final Widget? extra;

  @override
  Widget build(BuildContext context) {
    Widget round(IconData icon, String tip, VoidCallback? onTap) => SizedBox(
      width: 40,
      height: 40,
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          padding: EdgeInsets.zero,
          shape: const CircleBorder(),
          side: const BorderSide(color: Color(0xFFCBD5E1)),
        ),
        child: Tooltip(message: tip, child: Icon(icon, size: 18)),
      ),
    );
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 56),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label, style: const TextStyle(fontSize: 15)),
                if (hint != null)
                  Text(
                    hint!,
                    style: const TextStyle(
                      fontSize: 12,
                      color: HodiColors.inkMuted,
                    ),
                  ),
              ],
            ),
          ),
          ?extra,
          round(Icons.remove, 'Fewer $label', onDec),
          Semantics(
            liveRegion: true,
            child: SizedBox(
              width: 36,
              child: Text(
                value,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          round(Icons.add, 'More $label', onInc),
        ],
      ),
    );
  }
}
