import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/widgets/common.dart';
import 'host_api.dart';
import 'host_models.dart';

class BookingFormScreen extends ConsumerStatefulWidget {
  const BookingFormScreen({
    super.key,
    this.initialListingId,
    this.initialCheckIn,
    this.initialCheckOut,
  });

  final String? initialListingId;
  final String? initialCheckIn;
  final String? initialCheckOut;

  @override
  ConsumerState<BookingFormScreen> createState() => _BookingFormScreenState();
}

class _BookingFormScreenState extends ConsumerState<BookingFormScreen> {
  String? _listingId;
  late final TextEditingController _checkInCtrl;
  late final TextEditingController _checkOutCtrl;
  final _guestsCtrl = TextEditingController(text: '1');
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  String _source = 'DIRECT';
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _listingId = widget.initialListingId;
    final today = DateTime.now();
    final defIn =
        widget.initialCheckIn ?? today.toIso8601String().substring(0, 10);
    final defOut =
        widget.initialCheckOut ??
        today.add(const Duration(days: 2)).toIso8601String().substring(0, 10);
    _checkInCtrl = TextEditingController(text: defIn);
    _checkOutCtrl = TextEditingController(text: defOut);
  }

  @override
  void dispose() {
    _checkInCtrl.dispose();
    _checkOutCtrl.dispose();
    _guestsCtrl.dispose();
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _save(List<HostListing> listings) async {
    final lid = _listingId ?? (listings.isNotEmpty ? listings.first.id : null);
    if (lid == null) {
      setState(() => _error = 'Create a listing first.');
      return;
    }
    if (_nameCtrl.text.trim().isEmpty || _phoneCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Enter the guest name and phone number.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(hostApiProvider).createBooking({
        'listingId': lid,
        'checkIn': _checkInCtrl.text.trim(),
        'checkOut': _checkOutCtrl.text.trim(),
        'guests': int.tryParse(_guestsCtrl.text.trim()) ?? 1,
        'source': _source,
        'guest': {
          'name': _nameCtrl.text.trim(),
          'phone': _phoneCtrl.text.trim(),
          if (_emailCtrl.text.trim().isNotEmpty)
            'email': _emailCtrl.text.trim(),
        },
        if (_noteCtrl.text.trim().isNotEmpty) 'note': _noteCtrl.text.trim(),
      });
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = messageOf(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final listingsAsync = ref.watch(hostListingsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('New booking')),
      body: listingsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(
          message: messageOf(e),
          onRetry: () => ref.invalidate(hostListingsProvider),
        ),
        data: (listings) {
          final selectedId =
              _listingId ?? (listings.isNotEmpty ? listings.first.id : null);
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (_error != null) ...[
                Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
                const SizedBox(height: 12),
              ],
              if (listings.isNotEmpty)
                DropdownButtonFormField<String>(
                  initialValue: selectedId,
                  decoration: const InputDecoration(labelText: 'Listing'),
                  items: [
                    for (final l in listings)
                      DropdownMenuItem(
                        value: l.id,
                        child: Text('${l.title} (${l.unitNumber})'),
                      ),
                  ],
                  onChanged: (v) => setState(() => _listingId = v),
                ),
              const SizedBox(height: 12),
              TextField(
                controller: _checkInCtrl,
                decoration: const InputDecoration(
                  labelText: 'Check-in (YYYY-MM-DD)',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _checkOutCtrl,
                decoration: const InputDecoration(
                  labelText: 'Check-out (YYYY-MM-DD)',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _guestsCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Guests'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _source,
                decoration: const InputDecoration(labelText: 'Source'),
                items: const [
                  DropdownMenuItem(
                    value: 'DIRECT',
                    child: Text('Direct / Walk-in'),
                  ),
                  DropdownMenuItem(value: 'PHONE', child: Text('Phone')),
                  DropdownMenuItem(value: 'WHATSAPP', child: Text('WhatsApp')),
                ],
                onChanged: (v) {
                  if (v != null) setState(() => _source = v);
                },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _nameCtrl,
                decoration: const InputDecoration(labelText: 'Guest name'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Guest phone'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Guest email (optional)',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _noteCtrl,
                decoration: const InputDecoration(labelText: 'Note (optional)'),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _saving ? null : () => _save(listings),
                child: const Text('Create booking'),
              ),
            ],
          );
        },
      ),
    );
  }
}
