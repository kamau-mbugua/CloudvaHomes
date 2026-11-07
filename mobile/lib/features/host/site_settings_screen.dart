import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/widgets/common.dart';
import '../staff/staff_widgets.dart';
import 'host_api.dart';
import 'host_models.dart';

class SiteSettingsScreen extends ConsumerStatefulWidget {
  const SiteSettingsScreen({super.key});

  @override
  ConsumerState<SiteSettingsScreen> createState() => _SiteSettingsScreenState();
}

class _SiteSettingsScreenState extends ConsumerState<SiteSettingsScreen> {
  final _slug = TextEditingController();
  final _businessName = TextEditingController();
  final _about = TextEditingController();
  final _contactPhone = TextEditingController();
  final _whatsappPhone = TextEditingController();
  final _checkInTime = TextEditingController(text: '14:00');
  final _checkOutTime = TextEditingController(text: '11:00');
  final _houseRules = TextEditingController();

  bool _published = false;
  String _bookingMode = 'INSTANT';
  String _paymentKind = 'FULL_UPFRONT';
  String _cancelKind = 'MODERATE';
  String? _address;
  String? _slugStatus;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _slug.dispose();
    _businessName.dispose();
    _about.dispose();
    _contactPhone.dispose();
    _whatsappPhone.dispose();
    _checkInTime.dispose();
    _checkOutTime.dispose();
    _houseRules.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final site = await ref.read(hostApiProvider).site();
      _slug.text = site.slug ?? '';
      _businessName.text = site.businessName ?? '';
      _about.text = site.about ?? '';
      _contactPhone.text = site.contactPhone ?? '';
      _whatsappPhone.text = site.whatsappPhone ?? '';
      _checkInTime.text = site.checkInTime;
      _checkOutTime.text = site.checkOutTime;
      _houseRules.text = site.houseRules ?? '';
      _published = site.published;
      _bookingMode = site.rules.bookingMode;
      _paymentKind = site.rules.payment.kind;
      _cancelKind = site.rules.cancellation.kind;
      _address = site.address;
    } on ApiError catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _checkSlug(String value) async {
    final clean = value.trim().toLowerCase();
    if (clean.isEmpty) {
      setState(() => _slugStatus = null);
      return;
    }
    try {
      final res = await ref.read(hostApiProvider).checkSlug(clean);
      if (mounted) {
        setState(() {
          _slugStatus = res.available
              ? 'Available'
              : (res.problem ?? 'That web address is already taken');
        });
      }
    } on ApiError catch (e) {
      if (mounted) setState(() => _slugStatus = e.message);
    }
  }

  Future<void> _save() async {
    if (_published && _slug.text.trim().isEmpty) {
      setState(() => _error = 'Choose a web address first');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final updated = await ref.read(hostApiProvider).updateSite({
        'slug': _slug.text.trim().isEmpty
            ? null
            : _slug.text.trim().toLowerCase(),
        'published': _published,
        'businessName': _businessName.text.trim().isEmpty
            ? null
            : _businessName.text.trim(),
        'about': _about.text.trim().isEmpty ? null : _about.text.trim(),
        'contactPhone': _contactPhone.text.trim().isEmpty
            ? null
            : _contactPhone.text.trim(),
        'whatsappPhone': _whatsappPhone.text.trim().isEmpty
            ? null
            : _whatsappPhone.text.trim(),
        'checkInTime': _checkInTime.text.trim(),
        'checkOutTime': _checkOutTime.text.trim(),
        'houseRules': _houseRules.text.trim().isEmpty
            ? null
            : _houseRules.text.trim(),
        'rules': StayRules(
          bookingMode: _bookingMode,
          payment: StayPaymentRule(kind: _paymentKind),
          cancellation: StayCancelRule(kind: _cancelKind),
        ).toJson(),
      });
      _address = updated.address;
      ref.invalidate(hostSiteProvider);
      if (mounted) showMessage(context, 'Booking site settings saved.');
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canUpdate = can(ref, 'site:update');

    return Scaffold(
      appBar: const KodiHubAppBar(title: Text('Booking site')),
      body: _loading
          ? const KodiHubSkeletonList(rows: 4)
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 36),
              children: [
                if (_error != null) ...[
                  ErrorBox(_error!),
                  const SizedBox(height: 12),
                ],
                TextField(
                  controller: _slug,
                  enabled: canUpdate,
                  onChanged: _checkSlug,
                  decoration: InputDecoration(
                    labelText: 'Web address (subdomain)',
                    hintText: 'e.g. diani-breezes',
                    helperText: _slugStatus ?? _address,
                  ),
                ),
                const SizedBox(height: 12),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Publish guest booking site'),
                  subtitle: Text(_address ?? 'Set a web address to publish'),
                  value: _published,
                  onChanged: canUpdate
                      ? (v) => setState(() => _published = v)
                      : null,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _businessName,
                  enabled: canUpdate,
                  decoration: const InputDecoration(labelText: 'Business name'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _about,
                  enabled: canUpdate,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'About your stays',
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _contactPhone,
                        enabled: canUpdate,
                        decoration: const InputDecoration(
                          labelText: 'Contact phone',
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: _whatsappPhone,
                        enabled: canUpdate,
                        decoration: const InputDecoration(
                          labelText: 'WhatsApp phone',
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
                        controller: _checkInTime,
                        enabled: canUpdate,
                        decoration: const InputDecoration(
                          labelText: 'Check-in time',
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: _checkOutTime,
                        enabled: canUpdate,
                        decoration: const InputDecoration(
                          labelText: 'Check-out time',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _bookingMode,
                  decoration: const InputDecoration(labelText: 'Booking mode'),
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
                  onChanged: canUpdate
                      ? (v) => setState(() => _bookingMode = v ?? 'INSTANT')
                      : null,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _paymentKind,
                  decoration: const InputDecoration(labelText: 'Payment terms'),
                  items: const [
                    DropdownMenuItem(
                      value: 'FULL_UPFRONT',
                      child: Text('Full amount upfront'),
                    ),
                    DropdownMenuItem(
                      value: 'DEPOSIT',
                      child: Text('Deposit upfront (50%)'),
                    ),
                    DropdownMenuItem(
                      value: 'ON_ARRIVAL',
                      child: Text('Pay on arrival'),
                    ),
                  ],
                  onChanged: canUpdate
                      ? (v) =>
                            setState(() => _paymentKind = v ?? 'FULL_UPFRONT')
                      : null,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _cancelKind,
                  decoration: const InputDecoration(
                    labelText: 'Cancellation policy',
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: 'FLEXIBLE',
                      child: Text('Flexible'),
                    ),
                    DropdownMenuItem(
                      value: 'MODERATE',
                      child: Text('Moderate'),
                    ),
                    DropdownMenuItem(value: 'STRICT', child: Text('Strict')),
                  ],
                  onChanged: canUpdate
                      ? (v) => setState(() => _cancelKind = v ?? 'MODERATE')
                      : null,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _houseRules,
                  enabled: canUpdate,
                  maxLines: 3,
                  decoration: const InputDecoration(labelText: 'House rules'),
                ),
                const SizedBox(height: 20),
                if (canUpdate)
                  FilledButton(
                    onPressed: _saving ? null : _save,
                    child: KodiHubButtonChild(
                      loading: _saving,
                      label: 'Save settings',
                      loadingLabel: 'Saving…',
                      tone: SpinnerTone.navy,
                    ),
                  ),
              ],
            ),
    );
  }
}
