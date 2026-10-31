import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_error.dart';
import '../../../core/dates.dart';
import '../../../core/money.dart';
import '../../../core/widgets/common.dart';
import '../../../core/widgets/paged_list.dart';
import '../staff_api.dart';
import '../staff_models.dart';
import '../staff_widgets.dart';

// ───────────────────────────────────────────── 1. Maintenance Requests

class StaffMaintenanceScreen extends ConsumerStatefulWidget {
  const StaffMaintenanceScreen({super.key});
  @override
  ConsumerState<StaffMaintenanceScreen> createState() =>
      _StaffMaintenanceScreenState();
}

class _StaffMaintenanceScreenState
    extends ConsumerState<StaffMaintenanceScreen> {
  String _q = '';
  String? _status;

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(staffApiProvider);
    final version = ref.watch(listsVersionProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Maintenance & repairs')),
      floatingActionButton: can(ref, 'maintenance:create')
          ? FloatingActionButton.extended(
              heroTag: 'fab-maintenance',
              icon: const Icon(Icons.add),
              label: const Text('New request'),
              onPressed: () => _CreateMaintenanceSheet.show(context),
            )
          : null,
      body: !can(ref, 'maintenance:view')
          ? const NoPermission('maintenance requests')
          : Column(
              children: [
                SearchField(
                  hint: 'Request no., title or description',
                  onChanged: (v) => setState(() => _q = v),
                ),
                SizedBox(
                  height: 52,
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 6,
                    ),
                    child: Row(
                      children: [
                        for (final (val, label) in const [
                          (null, 'All'),
                          ('OPEN', 'Open'),
                          ('IN_PROGRESS', 'In progress'),
                          ('RESOLVED', 'Resolved'),
                          ('CLOSED', 'Closed'),
                        ])
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                              label: Text(label),
                              selected: _status == val,
                              onSelected: (_) => setState(() => _status = val),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                Expanded(
                  child: PagedList<Json>(
                    resetKey: (_q, _status, version),
                    padding: const EdgeInsets.only(bottom: 88),
                    load: (page) async {
                      final p = await api.maintenanceRequests(
                        page: page,
                        status: _status,
                        q: _q,
                      );
                      return (rows: p.rows, hasMore: p.hasMore);
                    },
                    empty: const EmptyState(
                      icon: Icons.handyman_outlined,
                      title: 'No maintenance requests',
                      body:
                          'Requests submitted by tenants or staff appear here.',
                    ),
                    itemBuilder: (context, r) {
                      final status = r['status'] as String? ?? 'OPEN';
                      final prop =
                          (r['property'] as Map?)?['name'] as String? ?? '';
                      final unit = (r['unit'] as Map?)?['number'] as String?;
                      return ListTile(
                        title: Text(
                          '${r['title'] ?? ''} · ${r['number'] ?? ''}',
                        ),
                        subtitle: Text(
                          [
                            if (unit != null) 'Unit $unit',
                            if (prop.isNotEmpty) prop,
                            expenseCategoryLabel[r['category']] ??
                                r['category'] ??
                                '',
                            r['priority'] ?? '',
                          ].where((s) => '$s'.isNotEmpty).join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: StatusChip(
                          switch (status) {
                            'IN_PROGRESS' => 'In progress',
                            'RESOLVED' => 'Resolved',
                            'CLOSED' => 'Closed',
                            _ => 'Open',
                          },
                          tone: switch (status) {
                            'RESOLVED' || 'CLOSED' => Tone.good,
                            'IN_PROGRESS' => Tone.warn,
                            _ => Tone.neutral,
                          },
                        ),
                        onTap: () => _MaintenanceDetailSheet.show(context, r),
                      );
                    },
                  ),
                ),
              ],
            ),
    );
  }
}

class _CreateMaintenanceSheet extends ConsumerStatefulWidget {
  const _CreateMaintenanceSheet();

  static Future<void> show(BuildContext context) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => const _CreateMaintenanceSheet(),
  );

  @override
  ConsumerState<_CreateMaintenanceSheet> createState() =>
      _CreateMaintenanceSheetState();
}

class _CreateMaintenanceSheetState
    extends ConsumerState<_CreateMaintenanceSheet> {
  final _title = TextEditingController();
  final _desc = TextEditingController();
  String? _propertyId;
  String _category = 'REPAIRS';
  String _priority = 'MEDIUM';
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _save(List<PropertyOption> properties) async {
    final propId =
        _propertyId ?? (properties.length == 1 ? properties.first.id : null);
    if (propId == null ||
        _title.text.trim().isEmpty ||
        _desc.text.trim().isEmpty) {
      setState(() => _error = 'Choose a property, title and description.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(staffApiProvider).createMaintenanceRequest({
        'propertyId': propId,
        'title': _title.text.trim(),
        'description': _desc.text.trim(),
        'category': _category,
        'priority': _priority,
      });
      ref.read(listsVersionProvider.notifier).state++;
      if (mounted) {
        showMessage(context, 'Maintenance request logged.');
        Navigator.of(context).pop();
      }
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = staffErrorMessage(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final properties =
        ref.watch(propertiesProvider).valueOrNull ?? const <PropertyOption>[];
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        4,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'New maintenance request',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue:
                  _propertyId ??
                  (properties.length == 1 ? properties.first.id : null),
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Property'),
              items: [
                for (final p in properties)
                  DropdownMenuItem(value: p.id, child: Text(p.name)),
              ],
              onChanged: (v) => setState(() => _propertyId = v),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _title,
              decoration: const InputDecoration(labelText: 'Title'),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _category,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Category'),
                    items: [
                      for (final e in expenseCategoryLabel.entries)
                        DropdownMenuItem(value: e.key, child: Text(e.value)),
                    ],
                    onChanged: (v) {
                      if (v != null) setState(() => _category = v);
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _priority,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Priority'),
                    items: const [
                      DropdownMenuItem(value: 'LOW', child: Text('Low')),
                      DropdownMenuItem(value: 'MEDIUM', child: Text('Medium')),
                      DropdownMenuItem(value: 'HIGH', child: Text('High')),
                      DropdownMenuItem(value: 'URGENT', child: Text('Urgent')),
                    ],
                    onChanged: (v) {
                      if (v != null) setState(() => _priority = v);
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _desc,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Description'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              ErrorBox(_error!),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _saving ? null : () => _save(properties),
              child: Text(_saving ? 'Saving…' : 'Save request'),
            ),
          ],
        ),
      ),
    );
  }
}

class _MaintenanceDetailSheet extends ConsumerStatefulWidget {
  const _MaintenanceDetailSheet({required this.item});
  final Json item;

  static Future<void> show(BuildContext context, Json item) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => _MaintenanceDetailSheet(item: item),
      );

  @override
  ConsumerState<_MaintenanceDetailSheet> createState() =>
      _MaintenanceDetailSheetState();
}

class _MaintenanceDetailSheetState
    extends ConsumerState<_MaintenanceDetailSheet> {
  late String _status = widget.item['status'] as String? ?? 'OPEN';
  late final _note = TextEditingController(
    text: widget.item['resolutionNote'] as String? ?? '',
  );
  final _expenseAmount = TextEditingController();
  final _expensePayee = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    _expenseAmount.dispose();
    _expensePayee.dispose();
    super.dispose();
  }

  Future<void> _update() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(staffApiProvider).updateMaintenanceRequest(
        widget.item['id'] as String,
        {'status': _status, 'resolutionNote': _note.text.trim()},
      );
      ref.read(listsVersionProvider.notifier).state++;
      if (mounted) {
        showMessage(context, 'Maintenance request updated.');
        Navigator.of(context).pop();
      }
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = staffErrorMessage(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _convertToExpense() async {
    final cents = parseKes(_expenseAmount.text);
    if (cents == null || cents <= 0) {
      setState(() => _error = 'Enter the repair cost in KES.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(staffApiProvider)
          .convertMaintenanceToExpense(widget.item['id'] as String, {
            'amount': cents,
            'incurredOn': toDay(nairobiToday()),
            if (_expensePayee.text.trim().isNotEmpty)
              'payee': _expensePayee.text.trim(),
          });
      ref.read(listsVersionProvider.notifier).state++;
      ref.invalidate(dashboardProvider);
      if (mounted) {
        showMessage(context, 'Logged as a property expense.');
        Navigator.of(context).pop();
      }
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = staffErrorMessage(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.item;
    final canUpdate = can(ref, 'maintenance:update');
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        4,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '${r['number'] ?? ''} · ${r['title'] ?? ''}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text('${r['description'] ?? ''}'),
            if (canUpdate) ...[
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _status,
                decoration: const InputDecoration(labelText: 'Status'),
                items: const [
                  DropdownMenuItem(value: 'OPEN', child: Text('Open')),
                  DropdownMenuItem(
                    value: 'IN_PROGRESS',
                    child: Text('In progress'),
                  ),
                  DropdownMenuItem(value: 'RESOLVED', child: Text('Resolved')),
                  DropdownMenuItem(value: 'CLOSED', child: Text('Closed')),
                ],
                onChanged: (v) {
                  if (v != null) setState(() => _status = v);
                },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _note,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Resolution note (shared with tenant)',
                ),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _saving ? null : _update,
                child: Text(_saving ? 'Saving…' : 'Update status'),
              ),
              if (r['expense'] == null && can(ref, 'expenses:create')) ...[
                const Divider(height: 28),
                Text(
                  'Convert to repair expense',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _expenseAmount,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: const InputDecoration(
                          labelText: 'Amount (KES)',
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: _expensePayee,
                        decoration: const InputDecoration(
                          labelText: 'Payee / fundi',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  icon: const Icon(Icons.receipt_long_outlined),
                  label: const Text('Record expense'),
                  onPressed: _saving ? null : _convertToExpense,
                ),
              ],
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              ErrorBox(_error!),
            ],
          ],
        ),
      ),
    );
  }
}

// ───────────────────────────────────────────── 2. Properties Management

class StaffPropertiesScreen extends ConsumerWidget {
  const StaffPropertiesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final properties = ref.watch(propertiesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Properties')),
      floatingActionButton: can(ref, 'properties:create')
          ? FloatingActionButton.extended(
              heroTag: 'fab-properties',
              icon: const Icon(Icons.add),
              label: const Text('Add property'),
              onPressed: () => _CreatePropertySheet.show(context, ref),
            )
          : null,
      body: AsyncBody(
        value: properties,
        onRetry: () => ref.invalidate(propertiesProvider),
        data: (rows) => rows.isEmpty
            ? const EmptyState(
                icon: Icons.apartment_outlined,
                title: 'No properties yet',
                body: 'Add your first building or estate.',
              )
            : ListView.builder(
                itemCount: rows.length,
                itemBuilder: (context, i) {
                  final p = rows[i];
                  return ListTile(
                    leading: const Icon(Icons.apartment_outlined),
                    title: Text(p.name),
                    subtitle: Text('Code: ${p.code}'),
                  );
                },
              ),
      ),
    );
  }
}

class _CreatePropertySheet {
  static Future<void> show(BuildContext context, WidgetRef ref) async {
    final nameCtrl = TextEditingController();
    final codeCtrl = TextEditingController();
    final locationCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add property'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameCtrl,
              decoration: const InputDecoration(labelText: 'Property name'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: codeCtrl,
              decoration: const InputDecoration(
                labelText: 'Short code (e.g. IBH)',
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: locationCtrl,
              decoration: const InputDecoration(
                labelText: 'Location / address (optional)',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    if (nameCtrl.text.trim().isEmpty || codeCtrl.text.trim().isEmpty) return;
    try {
      await ref.read(staffApiProvider).createProperty({
        'name': nameCtrl.text.trim(),
        'code': codeCtrl.text.trim().toUpperCase(),
        if (locationCtrl.text.trim().isNotEmpty)
          'location': locationCtrl.text.trim(),
      });
      ref.invalidate(propertiesProvider);
      if (context.mounted) showMessage(context, 'Property created.');
    } on ApiError catch (e) {
      if (context.mounted) showMessage(context, staffErrorMessage(e));
    }
  }
}

// ───────────────────────────────────────────── 3. Reports Screen

final _reportPlProvider = FutureProvider.autoDispose<Json>(
  (ref) => ref.watch(staffApiProvider).reportPl(nairobiPeriod()),
);
final _reportArrearsProvider = FutureProvider.autoDispose<Json>(
  (ref) => ref.watch(staffApiProvider).reportArrears(),
);
final _reportOccupancyProvider = FutureProvider.autoDispose<Json>(
  (ref) => ref.watch(staffApiProvider).reportOccupancy(),
);

class StaffReportsScreen extends ConsumerWidget {
  const StaffReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Reports'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'P&L'),
              Tab(text: 'Arrears'),
              Tab(text: 'Occupancy'),
            ],
          ),
        ),
        body: !can(ref, 'reports:view')
            ? const NoPermission('reports')
            : const TabBarView(
                children: [_PlTab(), _ArrearsTab(), _OccupancyTab()],
              ),
      ),
    );
  }
}

class _PlTab extends ConsumerWidget {
  const _PlTab();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncPl = ref.watch(_reportPlProvider);
    return AsyncBody(
      value: asyncPl,
      onRetry: () => ref.invalidate(_reportPlProvider),
      data: (d) {
        final totals = d['totals'] as Map<String, dynamic>? ?? const {};
        final rows = [
          for (final r in (d['rows'] as List? ?? const []))
            if (r is Map<String, dynamic>) r,
        ];
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            SectionCard(
              title: 'Summary (${formatPeriod(nairobiPeriod())})',
              children: [
                FactRow('Invoiced', formatKes(centsFrom(totals['invoiced']))),
                FactRow('Collected', formatKes(centsFrom(totals['collected']))),
                FactRow('Expenses', formatKes(centsFrom(totals['expenses']))),
                const Divider(),
                FactRow(
                  'Net operating income',
                  formatKes(centsFrom(totals['net'])),
                  bold: true,
                ),
              ],
            ),
            const SizedBox(height: 12),
            for (final r in rows)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: SectionCard(
                  title: '${(r['property'] as Map?)?['name'] ?? ''}',
                  children: [
                    FactRow('Collected', formatKes(centsFrom(r['collected']))),
                    FactRow('Expenses', formatKes(centsFrom(r['expenses']))),
                    FactRow('Net', formatKes(centsFrom(r['net'])), bold: true),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

class _ArrearsTab extends ConsumerWidget {
  const _ArrearsTab();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncArrears = ref.watch(_reportArrearsProvider);
    return AsyncBody(
      value: asyncArrears,
      onRetry: () => ref.invalidate(_reportArrearsProvider),
      data: (d) {
        final rows = [
          for (final r in (d['rows'] as List? ?? const []))
            if (r is Map<String, dynamic>) r,
        ];
        if (rows.isEmpty) {
          return const EmptyState(
            icon: Icons.check_circle_outline,
            title: 'No arrears',
            body: 'All tenants are up to date.',
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: rows.length,
          itemBuilder: (context, i) {
            final r = rows[i];
            final t = r['tenant'] as Map<String, dynamic>? ?? const {};
            return ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                '${t['firstName'] ?? ''} ${t['lastName'] ?? ''}'.trim(),
              ),
              subtitle: Text('${t['code'] ?? ''} · ${t['phone'] ?? ''}'),
              trailing: StatusChip(
                formatKes(centsFrom(r['overdue'] ?? r['balance'])),
                tone: Tone.bad,
              ),
            );
          },
        );
      },
    );
  }
}

class _OccupancyTab extends ConsumerWidget {
  const _OccupancyTab();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncOcc = ref.watch(_reportOccupancyProvider);
    return AsyncBody(
      value: asyncOcc,
      onRetry: () => ref.invalidate(_reportOccupancyProvider),
      data: (d) {
        final rows = [
          for (final r in (d['rows'] as List? ?? const []))
            if (r is Map<String, dynamic>) r,
        ];
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: rows.length,
          itemBuilder: (context, i) {
            final r = rows[i];
            final prop = r['property'] as Map<String, dynamic>? ?? const {};
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: SectionCard(
                title: '${prop['name'] ?? ''}',
                children: [
                  FactRow('Total units', '${r['units'] ?? 0}'),
                  FactRow('Occupied', '${r['occupied'] ?? 0}'),
                  FactRow('On notice', '${r['notice'] ?? 0}'),
                  FactRow('Vacant', '${r['vacant'] ?? 0}'),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

// ───────────────────────────────────────────── 4. Payment Channels, Charges, Agency & Users

final _allChannelsProvider = FutureProvider.autoDispose<List<Channel>>(
  (ref) => ref.watch(staffApiProvider).allChannels(),
);

class StaffChannelsScreen extends ConsumerWidget {
  const StaffChannelsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(_allChannelsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Payment channels')),
      floatingActionButton: can(ref, 'channels:manage')
          ? FloatingActionButton.extended(
              heroTag: 'fab-channels',
              icon: const Icon(Icons.add),
              label: const Text('Add channel'),
              onPressed: () => _addChannel(context, ref),
            )
          : null,
      body: AsyncBody(
        value: list,
        onRetry: () => ref.invalidate(_allChannelsProvider),
        data: (rows) => rows.isEmpty
            ? const EmptyState(
                icon: Icons.account_balance_outlined,
                title: 'No payment channels',
              )
            : ListView.builder(
                itemCount: rows.length,
                itemBuilder: (context, i) {
                  final c = rows[i];
                  return ListTile(
                    title: Text(c.name),
                    subtitle: Text(
                      [
                        channelKindLabel[c.kind] ?? c.kind,
                        if (c.shortcode != null) c.shortcode!,
                      ].join(' · '),
                    ),
                    trailing: StatusChip(
                      c.status == 'ACTIVE' ? 'Active' : 'Inactive',
                      tone: c.status == 'ACTIVE' ? Tone.good : Tone.neutral,
                    ),
                  );
                },
              ),
      ),
    );
  }

  Future<void> _addChannel(BuildContext context, WidgetRef ref) async {
    final nameCtrl = TextEditingController();
    final shortcodeCtrl = TextEditingController();
    String kind = 'MPESA_PAYBILL';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: const Text('Add payment channel'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: kind,
                decoration: const InputDecoration(labelText: 'Type'),
                items: [
                  for (final e in channelKindLabel.entries)
                    if (e.key != 'DEPOSIT')
                      DropdownMenuItem(value: e.key, child: Text(e.value)),
                ],
                onChanged: (v) {
                  if (v != null) setState(() => kind = v);
                },
              ),
              const SizedBox(height: 8),
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(labelText: 'Display name'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: shortcodeCtrl,
                decoration: const InputDecoration(
                  labelText: 'Paybill / Till / Account no. (optional)',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    if (ok != true || !context.mounted || nameCtrl.text.trim().isEmpty) return;
    try {
      await ref.read(staffApiProvider).createChannel({
        'kind': kind,
        'name': nameCtrl.text.trim(),
        if (shortcodeCtrl.text.trim().isNotEmpty)
          'shortcode': shortcodeCtrl.text.trim(),
      });
      ref.invalidate(_allChannelsProvider);
      ref.invalidate(channelsProvider);
      if (context.mounted) showMessage(context, 'Payment channel added.');
    } on ApiError catch (e) {
      if (context.mounted) showMessage(context, staffErrorMessage(e));
    }
  }
}

final _chargeTypesProvider = FutureProvider.autoDispose<List<Json>>(
  (ref) => ref.watch(staffApiProvider).chargeTypes(),
);

class StaffChargesScreen extends ConsumerWidget {
  const StaffChargesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(_chargeTypesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Recurring & metered charges')),
      body: AsyncBody(
        value: list,
        onRetry: () => ref.invalidate(_chargeTypesProvider),
        data: (rows) => rows.isEmpty
            ? const EmptyState(
                icon: Icons.bolt_outlined,
                title: 'No charge types configured',
              )
            : ListView.builder(
                itemCount: rows.length,
                itemBuilder: (context, i) {
                  final c = rows[i];
                  return ListTile(
                    title: Text('${c['name'] ?? ''} (${c['code'] ?? ''})'),
                    subtitle: Text(
                      '${c['kind'] ?? ''} · Default ${formatKes(centsFrom(c['defaultAmount']))}',
                    ),
                  );
                },
              ),
      ),
    );
  }
}

final _landlordsProvider = FutureProvider.autoDispose<List<Json>>(
  (ref) => ref.watch(staffApiProvider).landlords(),
);
final _remittancesProvider = FutureProvider.autoDispose<List<Json>>(
  (ref) => ref.watch(staffApiProvider).remittances(),
);

class StaffAgencyScreen extends ConsumerWidget {
  const StaffAgencyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final landlords = ref.watch(_landlordsProvider);
    final remittances = ref.watch(_remittancesProvider);
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Landlords & payouts'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Landlords'),
              Tab(text: 'Remittances'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            AsyncBody(
              value: landlords,
              onRetry: () => ref.invalidate(_landlordsProvider),
              data: (rows) => rows.isEmpty
                  ? const EmptyState(title: 'No landlords yet')
                  : ListView.builder(
                      itemCount: rows.length,
                      itemBuilder: (context, i) {
                        final l = rows[i];
                        return ListTile(
                          title: Text('${l['name'] ?? ''}'),
                          subtitle: Text(
                            '${l['code'] ?? ''} · ${l['phone'] ?? l['email'] ?? ''}',
                          ),
                        );
                      },
                    ),
            ),
            AsyncBody(
              value: remittances,
              onRetry: () => ref.invalidate(_remittancesProvider),
              data: (rows) => rows.isEmpty
                  ? const EmptyState(title: 'No remittances yet')
                  : ListView.builder(
                      itemCount: rows.length,
                      itemBuilder: (context, i) {
                        final r = rows[i];
                        return ListTile(
                          title: Text(
                            '${r['number'] ?? ''} · ${(r['landlord'] as Map?)?['name'] ?? ''}',
                          ),
                          subtitle: Text(
                            '${formatPeriod('${r['period'] ?? ''}')} · Net ${formatKes(centsFrom(r['net']))}',
                          ),
                          trailing: StatusChip('${r['status'] ?? 'DRAFT'}'),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

final _usersProvider = FutureProvider.autoDispose<List<Json>>(
  (ref) => ref.watch(staffApiProvider).users(),
);

class StaffUsersScreen extends ConsumerWidget {
  const StaffUsersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final users = ref.watch(_usersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Team & roles')),
      body: AsyncBody(
        value: users,
        onRetry: () => ref.invalidate(_usersProvider),
        data: (rows) => rows.isEmpty
            ? const EmptyState(title: 'No team members')
            : ListView.builder(
                itemCount: rows.length,
                itemBuilder: (context, i) {
                  final u = rows[i];
                  final user = u['user'] as Map<String, dynamic>? ?? u;
                  final role = u['role'] as Map<String, dynamic>?;
                  return ListTile(
                    leading: const Icon(Icons.person_outline),
                    title: Text(
                      '${user['firstName'] ?? ''} ${user['lastName'] ?? ''}'
                          .trim(),
                    ),
                    subtitle: Text(
                      '${user['email'] ?? user['phone'] ?? ''} · ${role?['name'] ?? u['roleName'] ?? ''}',
                    ),
                  );
                },
              ),
      ),
    );
  }
}
