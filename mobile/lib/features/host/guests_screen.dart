import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/money.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/paged_list.dart';
import '../staff/staff_widgets.dart';
import 'host_api.dart';
import 'host_models.dart';

class GuestsScreen extends ConsumerStatefulWidget {
  const GuestsScreen({super.key});

  @override
  ConsumerState<GuestsScreen> createState() => _GuestsScreenState();
}

class _GuestsScreenState extends ConsumerState<GuestsScreen> {
  String _q = '';
  int _refreshTick = 0;

  void _reload() {
    setState(() => _refreshTick++);
  }

  Future<void> _openGuest(HostGuest summary) async {
    final canUpdate = can(ref, 'guests:update');
    HostGuest detail;
    try {
      detail = await ref.read(hostApiProvider).guest(summary.id);
    } on ApiError catch (e) {
      if (mounted) showMessage(context, e.message);
      return;
    }
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => _GuestDetailSheet(
        guest: detail,
        canUpdate: canUpdate,
        onSaved: _reload,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(hostApiProvider);
    return Scaffold(
      appBar: const KodiHubAppBar(title: Text('Guests')),
      body: Column(
        children: [
          SearchField(
            hint: 'Search guest name or phone…',
            onChanged: (v) {
              setState(() => _q = v);
            },
          ),
          Expanded(
            child: PagedList<HostGuest>(
              resetKey: '$_q-$_refreshTick',
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              load: (page) => api.guests(page: page, q: _q),
              empty: const EmptyState(
                icon: Icons.people_outline,
                title: 'No guests found',
              ),
              itemBuilder: (context, g) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Card(
                  child: ListTile(
                    title: Text(
                      g.name,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      [
                        g.phone,
                        '${g.staysCount} stays',
                        if (g.totalPaidCents != null)
                          formatKes(g.totalPaidCents!),
                      ].join(' · '),
                    ),
                    trailing: g.doNotAccept
                        ? const StatusChip('Review')
                        : const Icon(Icons.chevron_right, size: 20),
                    onTap: () => _openGuest(g),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GuestDetailSheet extends ConsumerStatefulWidget {
  const _GuestDetailSheet({
    required this.guest,
    required this.canUpdate,
    required this.onSaved,
  });

  final HostGuest guest;
  final bool canUpdate;
  final VoidCallback onSaved;

  @override
  ConsumerState<_GuestDetailSheet> createState() => _GuestDetailSheetState();
}

class _GuestDetailSheetState extends ConsumerState<_GuestDetailSheet> {
  late final TextEditingController _notes = TextEditingController(
    text: widget.guest.notes ?? '',
  );
  final TextEditingController _idNumber = TextEditingController();
  late bool _doNotAccept = widget.guest.doNotAccept;
  bool _saving = false;

  @override
  void dispose() {
    _notes.dispose();
    _idNumber.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await ref.read(hostApiProvider).updateGuest(widget.guest.id, {
        'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
        'doNotAccept': _doNotAccept,
        if (_idNumber.text.trim().isNotEmpty) 'idNumber': _idNumber.text.trim(),
      });
      widget.onSaved();
      if (mounted) Navigator.of(context).pop();
    } on ApiError catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final g = widget.guest;
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              g.name,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              '${g.phone}${g.email != null ? ' · ${g.email}' : ''}',
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 12),
            Text('ID / Passport: ${g.idNumberHint ?? 'Not recorded'}'),
            const SizedBox(height: 4),
            if (g.totalPaidCents != null)
              Text('Total paid: ${formatKes(g.totalPaidCents!)}'),
            if (widget.canUpdate) ...[
              const SizedBox(height: 14),
              TextField(
                controller: _notes,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Host notes'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _idNumber,
                decoration: const InputDecoration(
                  labelText: 'Update ID / Passport (optional)',
                ),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Require review (no instant booking)'),
                value: _doNotAccept,
                onChanged: (v) => setState(() => _doNotAccept = v),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _saving ? null : _save,
                  child: Text(_saving ? 'Saving…' : 'Save changes'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
