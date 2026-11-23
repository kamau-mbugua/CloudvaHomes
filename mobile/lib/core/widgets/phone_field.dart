import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme.dart';

/// A country for phone numbers: ISO code, name and dialling code (without the +).
typedef PhoneCountry = ({String iso, String name, String dial});

/// Kenya first, then East Africa, then other countries guests and owners often come from.
const phoneCountries = <PhoneCountry>[
  (iso: 'KE', name: 'Kenya', dial: '254'),
  (iso: 'UG', name: 'Uganda', dial: '256'),
  (iso: 'TZ', name: 'Tanzania', dial: '255'),
  (iso: 'RW', name: 'Rwanda', dial: '250'),
  (iso: 'BI', name: 'Burundi', dial: '257'),
  (iso: 'SS', name: 'South Sudan', dial: '211'),
  (iso: 'ET', name: 'Ethiopia', dial: '251'),
  (iso: 'SO', name: 'Somalia', dial: '252'),
  (iso: 'CD', name: 'DR Congo', dial: '243'),
  (iso: 'NG', name: 'Nigeria', dial: '234'),
  (iso: 'GH', name: 'Ghana', dial: '233'),
  (iso: 'ZA', name: 'South Africa', dial: '27'),
  (iso: 'ZM', name: 'Zambia', dial: '260'),
  (iso: 'MW', name: 'Malawi', dial: '265'),
  (iso: 'ZW', name: 'Zimbabwe', dial: '263'),
  (iso: 'EG', name: 'Egypt', dial: '20'),
  (iso: 'AE', name: 'United Arab Emirates', dial: '971'),
  (iso: 'SA', name: 'Saudi Arabia', dial: '966'),
  (iso: 'QA', name: 'Qatar', dial: '974'),
  (iso: 'IN', name: 'India', dial: '91'),
  (iso: 'CN', name: 'China', dial: '86'),
  (iso: 'GB', name: 'United Kingdom', dial: '44'),
  (iso: 'US', name: 'United States', dial: '1'),
  (iso: 'CA', name: 'Canada', dial: '1'),
  (iso: 'DE', name: 'Germany', dial: '49'),
  (iso: 'FR', name: 'France', dial: '33'),
  (iso: 'NL', name: 'Netherlands', dial: '31'),
  (iso: 'SE', name: 'Sweden', dial: '46'),
  (iso: 'IT', name: 'Italy', dial: '39'),
  (iso: 'AU', name: 'Australia', dial: '61'),
];

const kenya = (iso: 'KE', name: 'Kenya', dial: '254');

/// 🇰🇪 from "KE".
String flagOf(String iso) => String.fromCharCodes(
  iso.toUpperCase().codeUnits.map((c) => 0x1F1E6 + c - 0x41),
);

/// A full number ("+254712345678") from a country and what was typed in the box
/// ("0712 345 678"): spaces and the leading 0 go. Empty when nothing was typed.
String composePhone(PhoneCountry country, String national) {
  final digits = national
      .replaceAll(RegExp(r'\D'), '')
      .replaceFirst(RegExp(r'^0+'), '');
  return digits.isEmpty ? '' : '+${country.dial}$digits';
}

/// Splits a stored number back into country and local part. "+256701234567" → Uganda,
/// "701234567"; a local number ("0712…") stays local, in [fallback] (Kenya).
({PhoneCountry country, String national}) splitPhone(
  String value, {
  PhoneCountry fallback = kenya,
}) {
  final v = value.trim();
  if (!v.startsWith('+')) return (country: fallback, national: v);
  final digits = v.substring(1).replaceAll(RegExp(r'\D'), '');
  // Longest dialling code first ("+1" is ambiguous; the first listed wins).
  final byLength = [...phoneCountries]
    ..sort((a, b) => b.dial.length.compareTo(a.dial.length));
  for (final c in byLength) {
    if (digits.startsWith(c.dial)) {
      final match = c.dial == fallback.dial ? fallback : c;
      return (country: match, national: digits.substring(c.dial.length));
    }
  }
  return (country: fallback, national: v);
}

/// A phone number box with a country picker (Kenya by default). It keeps [controller] filled
/// with the whole number ("+254712345678"), so forms read it as before.
class PhoneField extends StatefulWidget {
  const PhoneField({
    super.key,
    required this.controller,
    this.fieldKey,
    this.labelText = 'Phone number',
    this.hintText = '712 345 678',
    this.helperText,
    this.errorText,
    this.enabled = true,
    this.kenyaOnly = false,
    this.autofocus = false,
    this.textInputAction,
    this.onSubmitted,
    this.prefixIcon,
  });

  final TextEditingController controller;

  /// Key for the inner text box (tests and autofill).
  final Key? fieldKey;
  final String labelText;
  final String? hintText;
  final String? helperText;
  final String? errorText;
  final bool enabled;

  /// M-Pesa numbers: Kenya only, no picker.
  final bool kenyaOnly;
  final bool autofocus;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  final Widget? prefixIcon;

  @override
  State<PhoneField> createState() => _PhoneFieldState();
}

class _PhoneFieldState extends State<PhoneField> {
  final _national = TextEditingController();
  PhoneCountry _country = kenya;

  /// What this field last wrote into the outer controller.
  String _written = '';

  @override
  void initState() {
    super.initState();
    _readOuter();
    widget.controller.addListener(_outerChanged);
    _national.addListener(_write);
  }

  @override
  void didUpdateWidget(covariant PhoneField old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller.removeListener(_outerChanged);
      widget.controller.addListener(_outerChanged);
      _readOuter();
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_outerChanged);
    _national.dispose();
    super.dispose();
  }

  void _readOuter() {
    final text = widget.controller.text;
    final split = splitPhone(text);
    _country = widget.kenyaOnly ? kenya : split.country;
    _written = text;
    _national.text = split.country.dial == _country.dial
        ? split.national
        : text;
  }

  /// Someone set the outer controller (a saved login, clearing the form…): show it.
  void _outerChanged() {
    if (widget.controller.text == _written) return;
    setState(_readOuter);
  }

  void _write() {
    final typed = _national.text.trim();
    // A whole number pasted in ("+256…") picks its country.
    if (typed.startsWith('+') && !widget.kenyaOnly) {
      final split = splitPhone(typed, fallback: _country);
      if (split.national != typed) {
        setState(() => _country = split.country);
        _national.value = TextEditingValue(
          text: split.national,
          selection: TextSelection.collapsed(offset: split.national.length),
        );
        return;
      }
    }
    final whole = composePhone(_country, typed);
    if (whole == widget.controller.text) return;
    _written = whole;
    widget.controller.text = whole;
  }

  Future<void> _pickCountry() async {
    final picked = await showModalBottomSheet<PhoneCountry>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _CountrySheet(selected: _country),
    );
    if (picked == null || !mounted) return;
    setState(() => _country = picked);
    _write();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final country = Semantics(
      button: !widget.kenyaOnly,
      label: widget.kenyaOnly
          ? 'Kenya, plus ${_country.dial}'
          : 'Country: ${_country.name}, plus ${_country.dial}. Change',
      excludeSemantics: true,
      child: InkWell(
        key: const Key('phone-country'),
        onTap: widget.enabled && !widget.kenyaOnly ? _pickCountry : null,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 6, 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(flagOf(_country.iso), style: const TextStyle(fontSize: 18)),
              const SizedBox(width: 6),
              Text(
                '+${_country.dial}',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: cs.onSurface,
                ),
              ),
              if (!widget.kenyaOnly)
                Icon(Icons.arrow_drop_down, color: cs.onSurfaceVariant),
              const SizedBox(width: 4),
              Container(width: 1, height: 22, color: cs.outlineVariant),
            ],
          ),
        ),
      ),
    );
    return TextField(
      key: widget.fieldKey,
      controller: _national,
      enabled: widget.enabled,
      autofocus: widget.autofocus,
      keyboardType: TextInputType.phone,
      textInputAction: widget.textInputAction,
      onSubmitted: widget.onSubmitted,
      autofillHints: const [AutofillHints.telephoneNumberNational],
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]'))],
      decoration: InputDecoration(
        labelText: widget.labelText,
        hintText: widget.hintText,
        helperText: widget.helperText,
        errorText: widget.errorText,
        prefixIcon: country,
        prefixIconConstraints: const BoxConstraints(minHeight: 48),
      ),
    );
  }
}

class _CountrySheet extends StatefulWidget {
  const _CountrySheet({required this.selected});

  final PhoneCountry selected;

  @override
  State<_CountrySheet> createState() => _CountrySheetState();
}

class _CountrySheetState extends State<_CountrySheet> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final needle = _q.trim().toLowerCase().replaceFirst('+', '');
    final shown = [
      for (final c in phoneCountries)
        if (needle.isEmpty ||
            c.name.toLowerCase().contains(needle) ||
            c.dial.startsWith(needle) ||
            c.iso.toLowerCase() == needle)
          c,
    ];
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.7,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: TextField(
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'Search country or code',
                  prefixIcon: Icon(Icons.search),
                ),
                onChanged: (v) => setState(() => _q = v),
              ),
            ),
            Expanded(
              child: ListView(
                children: [
                  for (final c in shown)
                    ListTile(
                      leading: Text(
                        flagOf(c.iso),
                        style: const TextStyle(fontSize: 22),
                      ),
                      title: Text(c.name),
                      trailing: Text(
                        '+${c.dial}',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      selected: c.iso == widget.selected.iso,
                      selectedColor: HodiColors.limeText,
                      onTap: () => Navigator.of(context).pop(c),
                    ),
                  if (shown.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('No country matches.'),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
