import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/session_controller.dart';
import '../../core/widgets/common.dart';
import '../staff/staff_widgets.dart';
import 'host_api.dart';
import 'host_models.dart';

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
  final _securityDeposit = TextEditingController(text: '0');
  final _bedrooms = TextEditingController(text: '1');
  final _bathrooms = TextEditingController(text: '1');
  final _beds = TextEditingController(text: '1');
  final _maxGuests = TextEditingController(text: '2');
  final _minNights = TextEditingController(text: '1');
  final _maxNights = TextEditingController(text: '30');

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
  bool _loading = true;
  bool _saving = false;
  bool _uploadingPhoto = false;
  String? _error;
  Map<String, String> _fieldErrors = const {};

  bool get _isNew => widget.listingId == null || widget.listingId == 'new';

  @override
  void initState() {
    super.initState();
    _load();
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
    _securityDeposit.dispose();
    _bedrooms.dispose();
    _bathrooms.dispose();
    _beds.dispose();
    _maxGuests.dispose();
    _minNights.dispose();
    _maxNights.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final sessionProps =
        ref.read(sessionProvider).valueOrNull?.properties ?? const [];
    var props = [
      for (final p in sessionProps) (id: p.id, code: p.code, name: p.name),
    ];

    try {
      if (props.isEmpty) {
        props = await ref.read(hostApiProvider).properties();
      }
      if (!_isNew) {
        final item = await ref.read(hostApiProvider).listing(widget.listingId!);
        _loaded = item;
        _photos = item.photos;
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
        _securityDeposit.text = fromHostMinor(item.securityDeposit);
        _bedrooms.text = item.bedrooms.toString();
        _bathrooms.text = item.bathrooms.toString();
        _beds.text = item.beds.toString();
        _maxGuests.text = item.maxGuests.toString();
        _minNights.text = item.minNights.toString();
        _maxNights.text = item.maxNights.toString();
        _amenities
          ..clear()
          ..addAll(item.amenities);
        _published = item.published;
        if (item.rulesOverride != null) {
          _useDefaultRules = false;
          _bookingMode = item.rulesOverride!.bookingMode;
          _paymentKind = item.rulesOverride!.payment.kind;
          _cancelKind = item.rulesOverride!.cancellation.kind;
        }
      } else if (props.isNotEmpty) {
        _propertyId = props.first.id;
      }
    } on ApiError catch (e) {
      _error = e.message;
    } finally {
      if (mounted) {
        setState(() {
          _properties = props;
          if (_propertyId.isEmpty && props.isNotEmpty) {
            _propertyId = props.first.id;
          }
          _loading = false;
        });
      }
    }
  }

  Future<void> _save() async {
    final errors = <String, String>{};
    if (_isNew && _propertyId.isEmpty) {
      errors['propertyId'] = 'Choose a property';
    }
    if (_isNew && _unitNumber.text.trim().isEmpty) {
      errors['unitNumber'] = 'Enter a unit number';
    }
    if (_title.text.trim().isEmpty) {
      errors['title'] = 'Enter a listing title';
    }

    final nightlyMinor = toHostMinorString(_nightlyPrice.text);
    if (nightlyMinor == null) {
      errors['nightlyPrice'] = 'Use whole shillings';
    }

    String? weekendMinor;
    if (_weekendPrice.text.trim().isNotEmpty) {
      weekendMinor = toHostMinorString(_weekendPrice.text);
      if (weekendMinor == null) {
        errors['weekendPrice'] = 'Use whole shillings';
      }
    }

    final cleaningMinor = toHostMinorString(
      _cleaningFee.text.trim().isEmpty ? '0' : _cleaningFee.text,
      allowZero: true,
    );
    if (cleaningMinor == null) {
      errors['cleaningFee'] = 'Use whole shillings';
    }

    final depositMinor = toHostMinorString(
      _securityDeposit.text.trim().isEmpty ? '0' : _securityDeposit.text,
      allowZero: true,
    );
    if (depositMinor == null) {
      errors['securityDeposit'] = 'Use whole shillings';
    }

    setState(() {
      _fieldErrors = errors;
      _error = null;
    });
    if (errors.isNotEmpty) return;

    final rulesOverride = _useDefaultRules
        ? null
        : StayRules(
            bookingMode: _bookingMode,
            payment: StayPaymentRule(kind: _paymentKind),
            cancellation: StayCancelRule(kind: _cancelKind),
          ).toJson();

    final payload = <String, Object?>{
      if (_isNew) 'propertyId': _propertyId,
      if (_isNew) 'unitNumber': _unitNumber.text.trim(),
      'title': _title.text.trim(),
      'description': _description.text.trim().isEmpty
          ? null
          : _description.text.trim(),
      'area': _area.text.trim().isEmpty ? null : _area.text.trim(),
      'checkInInstructions': _checkInInstructions.text.trim().isEmpty
          ? null
          : _checkInInstructions.text.trim(),
      'bedrooms': int.tryParse(_bedrooms.text) ?? 1,
      'bathrooms': int.tryParse(_bathrooms.text) ?? 1,
      'beds': int.tryParse(_beds.text) ?? 1,
      'maxGuests': int.tryParse(_maxGuests.text) ?? 2,
      'minNights': int.tryParse(_minNights.text) ?? 1,
      'maxNights': int.tryParse(_maxNights.text) ?? 30,
      'nightlyPrice': nightlyMinor,
      'weekendPrice': weekendMinor,
      'cleaningFee': cleaningMinor,
      'securityDeposit': depositMinor,
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
          showMessage(context, 'Listing created.');
          if (GoRouter.maybeOf(context) != null) {
            context.go('/host/listings/${created.id}');
          }
        }
      } else {
        final updated = await api.updateListing(widget.listingId!, payload);
        _loaded = updated;
        ref.invalidate(hostListingsProvider);
        if (mounted) showMessage(context, 'Listing saved.');
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

  Future<void> _addPhoto() async {
    if (_loaded == null) return;
    final room = photosRoomLeft(_photos.length);
    final picked = await pickHostPhotos(context, limit: room);
    if (picked.isEmpty) return;
    setState(() => _uploadingPhoto = true);
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
      final refreshed = await ref.read(hostApiProvider).listing(_loaded!.id);
      if (mounted) {
        setState(() {
          _loaded = refreshed;
          _photos = refreshed.photos;
        });
      }
      ref.invalidate(hostListingsProvider);
    } on ApiError catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
    if (mounted) {
      showMessage(
        context,
        photoUploadMessage(added: added, failed: failed, skipped: 0),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final canEdit = _isNew
        ? can(ref, 'listings:create')
        : can(ref, 'listings:update');

    return Scaffold(
      appBar: KodiHubAppBar(
        title: Text(_isNew ? 'New listing' : (_loaded?.title ?? 'Listing')),
      ),
      bottomNavigationBar: !_loading && canEdit
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: FilledButton(
                  key: const Key('listing-save'),
                  onPressed: _saving ? null : _save,
                  child: KodiHubButtonChild(
                    loading: _saving,
                    label: _isNew ? 'Create listing' : 'Save changes',
                    loadingLabel: 'Saving…',
                    tone: SpinnerTone.navy,
                  ),
                ),
              ),
            )
          : null,
      body: _loading
          ? const KodiHubSkeletonList(rows: 4)
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 36),
              children: [
                if (_error != null) ...[
                  ErrorBox(_error!),
                  const SizedBox(height: 12),
                ],
                if (_isNew) ...[
                  DropdownButtonFormField<String>(
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
                  const SizedBox(height: 12),
                  TextField(
                    key: const Key('listing-unit-number'),
                    controller: _unitNumber,
                    enabled: canEdit,
                    decoration: InputDecoration(
                      labelText: 'Unit number / code',
                      hintText: 'e.g. A1',
                      errorText: _fieldErrors['unitNumber'],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                TextField(
                  key: const Key('listing-title'),
                  controller: _title,
                  enabled: canEdit,
                  decoration: InputDecoration(
                    labelText: 'Listing title',
                    hintText: 'e.g. Sea Breeze Studio',
                    errorText: _fieldErrors['title'],
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _area,
                  enabled: canEdit,
                  decoration: const InputDecoration(
                    labelText: 'Neighbourhood / area (optional)',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _description,
                  enabled: canEdit,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Description (optional)',
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        key: const Key('listing-nightly-price'),
                        controller: _nightlyPrice,
                        enabled: canEdit,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: InputDecoration(
                          labelText: 'Nightly price (KES)',
                          errorText: _fieldErrors['nightlyPrice'],
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: _weekendPrice,
                        enabled: canEdit,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: InputDecoration(
                          labelText: 'Weekend price (KES)',
                          errorText: _fieldErrors['weekendPrice'],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _cleaningFee,
                        enabled: canEdit,
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(
                          labelText: 'Cleaning fee (KES)',
                          errorText: _fieldErrors['cleaningFee'],
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: _securityDeposit,
                        enabled: canEdit,
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(
                          labelText: 'Security deposit (KES)',
                          errorText: _fieldErrors['securityDeposit'],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _bedrooms,
                        enabled: canEdit,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Bedrooms',
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _bathrooms,
                        enabled: canEdit,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Bathrooms',
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _maxGuests,
                        enabled: canEdit,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Max guests',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _minNights,
                        enabled: canEdit,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Min nights',
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: _maxNights,
                        enabled: canEdit,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Max nights',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _checkInInstructions,
                  enabled: canEdit,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Check-in instructions',
                  ),
                ),
                const SizedBox(height: 16),
                const Kicker('Amenities'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final amenity in commonHostAmenities)
                      FilterChip(
                        label: Text(amenity),
                        selected: _amenities.contains(amenity),
                        onSelected: canEdit
                            ? (sel) => setState(() {
                                if (sel) {
                                  _amenities.add(amenity);
                                } else {
                                  _amenities.remove(amenity);
                                }
                              })
                            : null,
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Use my default booking rules'),
                  value: _useDefaultRules,
                  onChanged: canEdit
                      ? (v) => setState(() => _useDefaultRules = v)
                      : null,
                ),
                if (!_useDefaultRules) ...[
                  DropdownButtonFormField<String>(
                    initialValue: _bookingMode,
                    decoration: const InputDecoration(
                      labelText: 'Booking mode',
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'INSTANT',
                        child: Text('Instant booking'),
                      ),
                      DropdownMenuItem(
                        value: 'REQUEST',
                        child: Text('Request to book'),
                      ),
                    ],
                    onChanged: canEdit
                        ? (v) => setState(() => _bookingMode = v ?? 'INSTANT')
                        : null,
                  ),
                  const SizedBox(height: 12),
                ],
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Published on booking site'),
                  value: _published,
                  onChanged: canEdit
                      ? (v) => setState(() => _published = v)
                      : null,
                ),
                if (!_isNew) ...[
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Kicker('Photos (${_photos.length}/20)'),
                      if (canEdit && _photos.length < 20)
                        OutlinedButton.icon(
                          onPressed: _uploadingPhoto ? null : _addPhoto,
                          icon: const Icon(
                            Icons.add_a_photo_outlined,
                            size: 18,
                          ),
                          label: Text(
                            _uploadingPhoto ? 'Uploading…' : 'Add photos',
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_photos.isEmpty)
                    const Text('No photos uploaded yet.')
                  else
                    Column(
                      children: [
                        for (var i = 0; i < _photos.length; i++)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: Icon(
                              i == 0 ? Icons.star : Icons.photo_outlined,
                            ),
                            title: Text(
                              i == 0 ? 'Cover photo (#1)' : 'Photo #${i + 1}',
                            ),
                            trailing: canEdit
                                ? IconButton(
                                    icon: const Icon(Icons.delete_outline),
                                    onPressed: () async {
                                      await ref
                                          .read(hostApiProvider)
                                          .deleteListingPhoto(
                                            _loaded!.id,
                                            _photos[i].id,
                                          );
                                      final refreshed = await ref
                                          .read(hostApiProvider)
                                          .listing(_loaded!.id);
                                      if (mounted) {
                                        setState(
                                          () => _photos = refreshed.photos,
                                        );
                                      }
                                    },
                                  )
                                : null,
                          ),
                      ],
                    ),
                ],
                const SizedBox(height: 20),
              ],
            ),
    );
  }
}
