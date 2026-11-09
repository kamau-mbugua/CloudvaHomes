import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import '../staff/staff_widgets.dart';
import 'host_api.dart';
import 'host_models.dart';
import 'legal_page_editor.dart';

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
  final _brand = TextEditingController();

  bool _published = false;
  String _bookingMode = 'INSTANT';
  String _paymentKind = 'FULL_UPFRONT';
  String _cancelKind = 'MODERATE';
  String? _address;
  bool? _guestCanPay;
  String _themePreset = 'forest';
  String? _brandError;
  Map<String, HostLegalPage> _legal = const {};
  final Map<String, String> _legalText = {};
  StayRules _loadedRules = const StayRules();
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
    _brand.dispose();
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
      _guestCanPay = site.guestCanPay;
      _loadedRules = site.rules;
      _themePreset = site.themePreset;
      _brand.text = site.brandColor ?? '';
      _legal = site.legal;
      for (final e in site.legal.entries) {
        _legalText[e.key] = e.value.text;
      }
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

  Future<void> _editLegal(
    ({String key, String title, String field, String path}) page,
  ) async {
    final legal = _legal[page.key];
    if (legal == null) return;
    final text = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => LegalPageEditor(
          title: page.title,
          text: _legalText[page.key] ?? legal.text,
          starter: legal.starter,
          viewUrl: _address == null ? null : '$_address${page.path}',
          canEdit: can(ref, 'site:update'),
        ),
      ),
    );
    if (text != null && mounted) setState(() => _legalText[page.key] = text);
  }

  Future<void> _copyLink() async {
    final address = _address;
    if (address == null) return;
    await Clipboard.setData(ClipboardData(text: address));
    if (mounted) showMessage(context, 'Link copied.');
  }

  Future<void> _save() async {
    if (_published && _slug.text.trim().isEmpty) {
      setState(() => _error = 'Choose a web address first');
      return;
    }
    final brand = _brand.text.trim();
    if (brand.isNotEmpty && !isHexColor(brand)) {
      setState(() => _brandError = 'Use a colour like #1F4D3A');
      return;
    }
    setState(() => _brandError = null);
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
        'themePreset': _themePreset,
        'brandColor': brand.isEmpty ? null : brand.toUpperCase(),
        for (final page in siteLegalPages)
          if (_legal[page.key] case final legal?)
            page.field: legalPayload(
              _legalText[page.key] ?? legal.text,
              legal.starter,
            ),
        'rules': StayRules(
          bookingMode: _bookingMode,
          // Keep deposit / custom-policy details set elsewhere (e.g. on the web) when only
          // the kind is shown here and it didn't change.
          payment: _loadedRules.payment.kind == _paymentKind
              ? _loadedRules.payment
              : StayPaymentRule(kind: _paymentKind),
          cancellation: _loadedRules.cancellation.kind == _cancelKind
              ? _loadedRules.cancellation
              : StayCancelRule(kind: _cancelKind),
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
                if (guestPaymentWarning(_guestCanPay, _paymentKind)
                    case final warning?) ...[
                  _PaymentWarning(warning),
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
                if (_address != null)
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          _address!,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                      TextButton.icon(
                        key: const Key('site-copy-link'),
                        onPressed: _copyLink,
                        icon: const Icon(Icons.copy_outlined, size: 18),
                        label: const Text('Copy link'),
                      ),
                    ],
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
                  isExpanded: true,
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
                  isExpanded: true,
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
                  isExpanded: true,
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
                const SizedBox(height: 24),
                Text(
                  'Look of your booking site',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                const Text(
                  'Pick a theme, or use your own brand colour. Text always stays readable.',
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final p in siteThemePresets)
                      ChoiceChip(
                        avatar: CircleAvatar(backgroundColor: Color(p.accent)),
                        label: Text(p.label),
                        selected:
                            _themePreset == p.key && _brand.text.trim().isEmpty,
                        onSelected: canUpdate
                            ? (_) => setState(() {
                                _themePreset = p.key;
                                _brand.clear();
                              })
                            : null,
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  key: const Key('site-brand'),
                  controller: _brand,
                  enabled: canUpdate,
                  onChanged: (_) => setState(() => _brandError = null),
                  decoration: InputDecoration(
                    labelText: 'Own brand colour (optional)',
                    hintText: '#1F4D3A',
                    helperText: 'Leave empty to use the theme colour.',
                    errorText: _brandError,
                    prefixIcon: isHexColor(_brand.text.trim())
                        ? Icon(
                            Icons.circle,
                            color: Color(
                              int.parse(
                                'FF${_brand.text.trim().substring(1)}',
                                radix: 16,
                              ),
                            ),
                          )
                        : null,
                  ),
                ),
                if (_legal.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  Text(
                    'Legal pages',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Shown on your booking site and linked in its footer and at booking. '
                    'Each starts from a plain-English starter text you can change.',
                  ),
                  for (final page in siteLegalPages)
                    if (_legal[page.key] case final legal?)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(page.title),
                        subtitle: Text(
                          (_legalText[page.key] ?? legal.text).trim() ==
                                  legal.starter.trim()
                              ? 'Starter text'
                              : 'Your text',
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => _editLegal(page),
                      ),
                ],
                const SizedBox(height: 20),
                if (canUpdate)
                  FilledButton(
                    key: const Key('site-save'),
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

/// Guests can't pay this host yet (no paybill/till, no M-Pesa prompt) and money is due upfront.
class _PaymentWarning extends StatelessWidget {
  const _PaymentWarning(this.message);
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: HodiColors.warningSoft,
        borderRadius: BorderRadius.circular(10),
        border: const Border(
          left: BorderSide(color: HodiColors.warning, width: 3),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.warning_amber_rounded, color: HodiColors.warning),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '$message Add one on the web under Money → Payment channels.',
              style: const TextStyle(color: HodiColors.warning, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}
