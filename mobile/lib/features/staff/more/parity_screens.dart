import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_error.dart';
import '../../../core/dates.dart';
import '../../../core/money.dart';
import '../../../core/theme.dart';
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
      appBar: const KodiHubAppBar(title: Text('Maintenance & repairs')),
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
                      final priority = r['priority'] as String? ?? 'MEDIUM';
                      return Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 4,
                        ),
                        child: Card(
                          child: ListTile(
                            leading: UnitBadge(
                              unit ?? 'PROP',
                              width: 48,
                              fontSize: 12,
                            ),
                            title: Text(
                              '${r['title'] ?? ''} · ${r['number'] ?? ''}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            subtitle: Text(
                              [
                                if (unit != null) 'Unit $unit',
                                if (prop.isNotEmpty) prop,
                                expenseCategoryLabel[r['category']] ??
                                    r['category'] ??
                                    '',
                                priority,
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
                            onTap: () =>
                                _MaintenanceDetailSheet.show(context, r),
                          ),
                        ),
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
    final propertiesAsync = ref.watch(propertiesProvider);
    final properties = propertiesAsync.valueOrNull ?? const <PropertyOption>[];
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
              decoration: InputDecoration(
                labelText: 'Property',
                helperText: propertiesAsync.isLoading
                    ? 'Loading properties…'
                    : null,
              ),
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
              child: KodiHubButtonChild(
                loading: _saving,
                label: 'Save request',
                loadingLabel: 'Saving…',
                tone: SpinnerTone.navy,
              ),
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
  int _tab = 0;
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
    final canExpense = r['expense'] == null && can(ref, 'expenses:create');
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
            Kicker('${r['number'] ?? ''} · ${r['priority'] ?? 'MEDIUM'}'),
            const SizedBox(height: 4),
            Text(
              '${r['title'] ?? ''}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text('${r['description'] ?? ''}'),
            if (canUpdate && canExpense) ...[
              const SizedBox(height: 14),
              KodiHubSegmentedTabs(
                tabs: const ['Status & Note', 'Record Expense'],
                index: _tab,
                onChanged: (i) => setState(() => _tab = i),
              ),
            ],
            if (canUpdate && _tab == 0) ...[
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
                child: KodiHubButtonChild(
                  loading: _saving,
                  label: 'Update status',
                  loadingLabel: 'Saving…',
                  tone: SpinnerTone.navy,
                ),
              ),
            ],
            if (canUpdate && canExpense && _tab == 1) ...[
              const SizedBox(height: 16),
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
              FilledButton.icon(
                icon: const Icon(Icons.receipt_long_outlined),
                label: const Text('Record expense'),
                onPressed: _saving ? null : _convertToExpense,
              ),
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
      appBar: const KodiHubAppBar(title: Text('Properties')),
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
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 88),
                itemCount: rows.length,
                itemBuilder: (context, i) {
                  final p = rows[i];
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Card(
                      child: ListTile(
                        leading: UnitBadge(p.code, width: 52),
                        title: Text(
                          p.name,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        subtitle: Text('Property code · ${p.code}'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () =>
                            Navigator.of(context, rootNavigator: true).push(
                              MaterialPageRoute<void>(
                                builder: (_) =>
                                    _PropertyDetailScreen(property: p),
                              ),
                            ),
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

final _propertyUnitsProvider = FutureProvider.autoDispose
    .family<List<UnitRow>, String>((ref, propertyId) async {
      final p = await ref
          .watch(staffApiProvider)
          .units(page: 1, propertyId: propertyId);
      return p.rows;
    });

class _PropertyDetailScreen extends ConsumerStatefulWidget {
  const _PropertyDetailScreen({required this.property});
  final PropertyOption property;

  @override
  ConsumerState<_PropertyDetailScreen> createState() =>
      _PropertyDetailScreenState();
}

class _PropertyDetailScreenState extends ConsumerState<_PropertyDetailScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final p = widget.property;
    final unitsAsync = ref.watch(_propertyUnitsProvider(p.id));
    final metersAsync = ref.watch(metersProvider(p.id));
    return Scaffold(
      appBar: KodiHubAppBar(
        title: Text(p.name),
        subtitle: 'Code · ${p.code}',
        actions: [
          if (can(ref, 'properties:update'))
            IconButton(
              tooltip: 'Edit property',
              icon: const Icon(Icons.edit_outlined),
              onPressed: () =>
                  _CreatePropertySheet.show(context, ref, existing: p),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          CurvedHeroCard(
            kicker: 'PROPERTY · ${p.code}',
            children: [
              Text(
                p.name,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              if (unitsAsync.valueOrNull != null)
                Builder(
                  builder: (_) {
                    final rows = unitsAsync.value!;
                    final letCount = rows
                        .where((u) => u.occupancy != 'VACANT')
                        .length;
                    return Text(
                      '$letCount of ${rows.length} units let · ${rows.length - letCount} vacant',
                      style: const TextStyle(
                        color: Color(0xFFB8C6D9),
                        fontSize: 13,
                      ),
                    );
                  },
                ),
            ],
          ),
          const SizedBox(height: 12),
          KodiHubSegmentedTabs(
            tabs: const ['Units', 'Meters', 'Details'],
            index: _tab,
            onChanged: (i) => setState(() => _tab = i),
          ),
          const SizedBox(height: 12),
          if (_tab == 0)
            SectionCard(
              title: 'Units in ${p.name}',
              children: [
                AsyncBody(
                  value: unitsAsync,
                  onRetry: () => ref.invalidate(_propertyUnitsProvider(p.id)),
                  data: (rows) => rows.isEmpty
                      ? const Text('No units in this property yet.')
                      : Column(
                          children: [
                            for (final (idx, u) in rows.indexed) ...[
                              if (idx > 0) const Divider(height: 1),
                              ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: UnitBadge(u.number),
                                title: Text(
                                  'Unit ${u.number}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                subtitle: Text(
                                  u.tenancy == null
                                      ? '${formatKes(u.rentAmount)} / mo'
                                      : '${u.tenancy!.tenant.name} · ${formatKes(u.rentAmount)}',
                                ),
                                trailing: StatusChip(
                                  occupancyLabel[u.occupancy] ?? u.occupancy,
                                  tone: occupancyTone(u.occupancy),
                                ),
                                onTap: () =>
                                    context.push('/staff/units/${u.id}'),
                              ),
                            ],
                          ],
                        ),
                ),
              ],
            )
          else if (_tab == 1)
            SectionCard(
              title: 'Utility meters',
              trailing: can(ref, 'meters:create')
                  ? TextButton(
                      onPressed: () => context.push('/staff/more/meters'),
                      child: const Text('Read meters →'),
                    )
                  : null,
              children: [
                AsyncBody(
                  value: metersAsync,
                  onRetry: () => ref.invalidate(metersProvider(p.id)),
                  data: (rows) => rows.isEmpty
                      ? const Text('No utility meters in this property.')
                      : Column(
                          children: [
                            for (final (idx, m) in rows.indexed) ...[
                              if (idx > 0) const Divider(height: 1),
                              ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: UnitBadge(m.unitNumber),
                                title: Text(
                                  '${m.unitNumber} · ${m.chargeName}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                subtitle: Text(
                                  'Meter ${m.serialNo} · ${m.lastReading == null ? 'no readings' : 'last ${m.lastReading!.current} ${m.unitLabel ?? ''}'}',
                                ),
                              ),
                            ],
                          ],
                        ),
                ),
              ],
            )
          else
            SectionCard(
              title: 'Property summary',
              children: [
                FactRow('Name', p.name),
                FactRow('Code', p.code),
                if (can(ref, 'properties:update')) ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('Edit property details'),
                    onPressed: () =>
                        _CreatePropertySheet.show(context, ref, existing: p),
                  ),
                ],
              ],
            ),
        ],
      ),
    );
  }
}

class _CreatePropertySheet {
  static Future<void> show(
    BuildContext context,
    WidgetRef ref, {
    PropertyOption? existing,
  }) async {
    final nameCtrl = TextEditingController(text: existing?.name ?? '');
    final codeCtrl = TextEditingController(text: existing?.code ?? '');
    final locationCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(existing == null ? 'Add property' : 'Edit property'),
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
      final body = {
        'name': nameCtrl.text.trim(),
        'code': codeCtrl.text.trim().toUpperCase(),
        if (locationCtrl.text.trim().isNotEmpty)
          'location': locationCtrl.text.trim(),
      };
      if (existing == null) {
        await ref.read(staffApiProvider).createProperty(body);
      } else {
        await ref.read(staffApiProvider).updateProperty(existing.id, body);
      }
      ref.invalidate(propertiesProvider);
      if (context.mounted) {
        showMessage(
          context,
          existing == null ? 'Property created.' : 'Property updated.',
        );
      }
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
        appBar: KodiHubAppBar(
          title: const Text('Reports'),
          subtitle: formatPeriod(nairobiPeriod()),
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
        final invMap = totals['invoiced'] is Map<String, dynamic>
            ? totals['invoiced'] as Map<String, dynamic>
            : null;
        final invoicedTotal = invMap != null
            ? centsFrom(invMap['total'])
            : centsFrom(totals['invoiced']);
        final rows = [
          for (final r in (d['rows'] as List? ?? const []))
            if (r is Map<String, dynamic>) r,
        ];
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            CurvedHeroCard(
              kicker: 'NET OPERATING INCOME · ${formatPeriod(nairobiPeriod())}',
              children: [
                Text(
                  formatKes(centsFrom(totals['net'])),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Collected ${formatKes(centsFrom(totals['collected']))} − Expenses ${formatKes(centsFrom(totals['expenses']))}',
                  style: const TextStyle(
                    color: Color(0xFFB8C6D9),
                    fontSize: 12.5,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SectionCard(
              title: 'Summary (${formatPeriod(nairobiPeriod())})',
              children: [
                FactRow('Invoiced', formatKes(invoicedTotal), bold: true),
                if (invMap != null) ...[
                  FactRow('  · Rent', formatKes(centsFrom(invMap['rent']))),
                  FactRow(
                    '  · Charges & utilities',
                    formatKes(centsFrom(invMap['charges'])),
                  ),
                  if (centsFrom(invMap['moveIn']) > 0)
                    FactRow(
                      '  · Move-in & deposits',
                      formatKes(centsFrom(invMap['moveIn'])),
                    ),
                ],
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
                  trailing: StatusChip(
                    formatKes(centsFrom(r['net'])),
                    tone: centsFrom(r['net']) >= 0 ? Tone.good : Tone.bad,
                  ),
                  children: [
                    if (r['invoiced'] is Map)
                      FactRow(
                        'Invoiced',
                        formatKes(centsFrom((r['invoiced'] as Map)['total'])),
                      ),
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
        final totals = d['totals'] as Map<String, dynamic>? ?? const {};
        final buckets = totals['buckets'] as Map<String, dynamic>? ?? const {};
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
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (buckets.isNotEmpty) ...[
              SectionCard(
                title: 'Aging breakdown',
                trailing: StatusChip(
                  formatKes(centsFrom(totals['overdue'] ?? totals['balance'])),
                  tone: Tone.bad,
                ),
                children: [
                  FactRow(
                    'Current (not yet due)',
                    formatKes(centsFrom(buckets['current'])),
                  ),
                  FactRow(
                    '1–30 days overdue',
                    formatKes(centsFrom(buckets['d1_30'])),
                  ),
                  FactRow(
                    '31–60 days overdue',
                    formatKes(centsFrom(buckets['d31_60'])),
                  ),
                  FactRow(
                    '61–90 days overdue',
                    formatKes(centsFrom(buckets['d61_90'])),
                  ),
                  FactRow(
                    '90+ days overdue',
                    formatKes(centsFrom(buckets['d90_plus'])),
                    bold: true,
                  ),
                ],
              ),
              const SizedBox(height: 12),
            ],
            SectionCard(
              title: 'Tenants in arrears (${rows.length})',
              children: [
                for (final (idx, r) in rows.indexed) ...[
                  if (idx > 0) const Divider(height: 1),
                  Builder(
                    builder: (_) {
                      final t =
                          r['tenant'] as Map<String, dynamic>? ?? const {};
                      final tid = t['id'] as String?;
                      final days = r['oldestOverdueDays'];
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: UnitBadge('${t['code'] ?? ''}', width: 52),
                        title: Text(
                          '${t['firstName'] ?? ''} ${t['lastName'] ?? ''}'
                              .trim(),
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        subtitle: Text(
                          [
                            '${t['phone'] ?? ''}',
                            if (days != null) '${days}d overdue',
                          ].where((s) => s.isNotEmpty).join(' · '),
                        ),
                        trailing: StatusChip(
                          formatKes(centsFrom(r['overdue'] ?? r['balance'])),
                          tone: Tone.bad,
                        ),
                        onTap: tid != null && can(ref, 'tenants:view')
                            ? () => context.push('/staff/tenants/$tid')
                            : null,
                      );
                    },
                  ),
                ],
              ],
            ),
          ],
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
        final totals = d['totals'] as Map<String, dynamic>? ?? const {};
        final rows = [
          for (final r in (d['rows'] as List? ?? const []))
            if (r is Map<String, dynamic>) r,
        ];
        final totalRate = (totals['rate'] as num?)?.toDouble();
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (totals.isNotEmpty) ...[
              CurvedHeroCard(
                kicker: 'PORTFOLIO OCCUPANCY',
                children: [
                  Text(
                    totalRate == null ? '—' : '${(totalRate * 100).round()}%',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 32,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: (totalRate ?? 0).clamp(0.0, 1.0),
                      minHeight: 8,
                      backgroundColor: Colors.white.withValues(alpha: 0.16),
                      valueColor: const AlwaysStoppedAnimation<Color>(
                        HodiColors.lime,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${totals['occupied'] ?? 0} occupied · ${totals['notice'] ?? 0} on notice · ${totals['vacant'] ?? 0} vacant',
                    style: const TextStyle(
                      color: Color(0xFFB8C6D9),
                      fontSize: 12.5,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
            ],
            for (final r in rows)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Builder(
                  builder: (_) {
                    final prop =
                        r['property'] as Map<String, dynamic>? ?? const {};
                    final rate = (r['rate'] as num?)?.toDouble();
                    return SectionCard(
                      title: '${prop['name'] ?? ''}',
                      trailing: StatusChip(
                        rate == null ? '—' : '${(rate * 100).round()}% let',
                        tone: (rate ?? 0) >= 0.8 ? Tone.good : Tone.warn,
                      ),
                      children: [
                        FactRow('Total units', '${r['units'] ?? 0}'),
                        FactRow('Occupied', '${r['occupied'] ?? 0}'),
                        FactRow('On notice', '${r['notice'] ?? 0}'),
                        FactRow('Vacant', '${r['vacant'] ?? 0}'),
                      ],
                    );
                  },
                ),
              ),
          ],
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
      appBar: const KodiHubAppBar(title: Text('Payment channels')),
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
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 88),
                itemCount: rows.length,
                itemBuilder: (context, i) {
                  final c = rows[i];
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Card(
                      child: ListTile(
                        leading: Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: c.isMpesa
                                ? HodiColors.limeSoft
                                : HodiColors.paper2,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(
                            c.isMpesa
                                ? Icons.phone_iphone
                                : Icons.account_balance_outlined,
                            color: HodiColors.navy,
                            size: 20,
                          ),
                        ),
                        title: Text(
                          c.name,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        subtitle: Text(
                          [
                            channelKindLabel[c.kind] ?? c.kind,
                            if (c.shortcode != null) c.shortcode!,
                            if (c.isMpesa)
                              c.darajaConfigured
                                  ? 'Daraja connected'
                                  : 'Manual M-Pesa',
                          ].join(' · '),
                        ),
                        trailing: StatusChip(
                          c.status == 'ACTIVE' ? 'Active' : 'Inactive',
                          tone: c.status == 'ACTIVE' ? Tone.good : Tone.neutral,
                        ),
                      ),
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
final _moveInChargesProvider = FutureProvider.autoDispose<List<Json>>(
  (ref) => ref.watch(staffApiProvider).moveInCharges(),
);

class StaffChargesScreen extends ConsumerStatefulWidget {
  const StaffChargesScreen({super.key});

  @override
  ConsumerState<StaffChargesScreen> createState() => _StaffChargesScreenState();
}

class _StaffChargesScreenState extends ConsumerState<StaffChargesScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final recurring = ref.watch(_chargeTypesProvider);
    final moveIn = ref.watch(_moveInChargesProvider);
    return Scaffold(
      appBar: const KodiHubAppBar(title: Text('Recurring & metered charges')),
      floatingActionButton: can(ref, 'charges:manage')
          ? FloatingActionButton.extended(
              heroTag: 'fab-charges',
              icon: const Icon(Icons.add),
              label: const Text('Add charge'),
              onPressed: () => _addChargeType(context),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: KodiHubSegmentedTabs(
              tabs: const ['Recurring & Metered', 'Move-in charges'],
              index: _tab,
              onChanged: (i) => setState(() => _tab = i),
            ),
          ),
          Expanded(
            child: _tab == 0
                ? AsyncBody(
                    value: recurring,
                    onRetry: () => ref.invalidate(_chargeTypesProvider),
                    data: (rows) => rows.isEmpty
                        ? const EmptyState(
                            icon: Icons.bolt_outlined,
                            title: 'No charge types configured',
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
                            itemCount: rows.length,
                            itemBuilder: (context, i) {
                              final c = rows[i];
                              final kind = '${c['kind'] ?? 'FIXED'}';
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Card(
                                  child: ListTile(
                                    leading: UnitBadge(
                                      '${c['code'] ?? ''}',
                                      width: 52,
                                    ),
                                    title: Text(
                                      '${c['name'] ?? ''}',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    subtitle: Text(
                                      '$kind · Default ${formatKes(centsFrom(c['defaultAmount']))}${c['unitLabel'] != null ? ' / ${c['unitLabel']}' : ''}',
                                    ),
                                    trailing: StatusChip(
                                      kind == 'METERED' ? 'Metered' : 'Fixed',
                                      tone: kind == 'METERED'
                                          ? Tone.info
                                          : Tone.neutral,
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                  )
                : AsyncBody(
                    value: moveIn,
                    onRetry: () => ref.invalidate(_moveInChargesProvider),
                    data: (rows) => rows.isEmpty
                        ? const EmptyState(
                            icon: Icons.door_front_door_outlined,
                            title: 'No move-in charges configured',
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
                            itemCount: rows.length,
                            itemBuilder: (context, i) {
                              final c = rows[i];
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Card(
                                  child: ListTile(
                                    title: Text(
                                      '${c['name'] ?? ''}',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    subtitle: Text(
                                      'Move-in fee · ${formatKes(centsFrom(c['amount']))}',
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _addChargeType(BuildContext context) async {
    final nameCtrl = TextEditingController();
    final codeCtrl = TextEditingController();
    final amountCtrl = TextEditingController();
    String kind = 'FIXED';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Add charge type'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: kind,
                decoration: const InputDecoration(labelText: 'Kind'),
                items: const [
                  DropdownMenuItem(
                    value: 'FIXED',
                    child: Text('Fixed monthly'),
                  ),
                  DropdownMenuItem(
                    value: 'METERED',
                    child: Text('Metered (per unit used)'),
                  ),
                ],
                onChanged: (v) {
                  if (v != null) setDialogState(() => kind = v);
                },
              ),
              const SizedBox(height: 8),
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(
                  labelText: 'Name (e.g. Water)',
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: codeCtrl,
                decoration: const InputDecoration(labelText: 'Code (e.g. WTR)'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: amountCtrl,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Default rate / amount (KES)',
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
    if (ok != true || !context.mounted) return;
    final cents = parseKes(amountCtrl.text);
    if (nameCtrl.text.trim().isEmpty ||
        codeCtrl.text.trim().isEmpty ||
        cents == null) {
      return;
    }
    try {
      await ref.read(staffApiProvider).createChargeType({
        'name': nameCtrl.text.trim(),
        'code': codeCtrl.text.trim().toUpperCase(),
        'kind': kind,
        'defaultAmount': cents,
        if (kind == 'METERED') 'unitLabel': 'm³',
      });
      ref.invalidate(_chargeTypesProvider);
      if (context.mounted) showMessage(context, 'Charge type added.');
    } on ApiError catch (e) {
      if (context.mounted) showMessage(context, staffErrorMessage(e));
    }
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
        appBar: const KodiHubAppBar(
          title: Text('Landlords & payouts'),
          bottom: TabBar(
            tabs: [
              Tab(text: 'Landlords'),
              Tab(text: 'Remittances'),
            ],
          ),
        ),
        floatingActionButton: can(ref, 'agency:manage')
            ? FloatingActionButton.extended(
                heroTag: 'fab-agency',
                icon: const Icon(Icons.person_add_outlined),
                label: const Text('Add landlord'),
                onPressed: () => _addLandlord(context, ref),
              )
            : null,
        body: TabBarView(
          children: [
            AsyncBody(
              value: landlords,
              onRetry: () => ref.invalidate(_landlordsProvider),
              data: (rows) => rows.isEmpty
                  ? const EmptyState(title: 'No landlords yet')
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 88),
                      itemCount: rows.length,
                      itemBuilder: (context, i) {
                        final l = rows[i];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Card(
                            child: ListTile(
                              leading: InitialsBadge(
                                name: '${l['name'] ?? '?'}',
                              ),
                              title: Text(
                                '${l['name'] ?? ''}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              subtitle: Text(
                                '${l['code'] ?? ''} · ${l['phone'] ?? l['email'] ?? ''}',
                              ),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => _LandlordDetailSheet.show(
                                context,
                                landlord: l,
                                allRemittances:
                                    remittances.valueOrNull ?? const [],
                              ),
                            ),
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
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 88),
                      itemCount: rows.length,
                      itemBuilder: (context, i) {
                        final r = rows[i];
                        final status = '${r['status'] ?? 'DRAFT'}';
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Card(
                            child: ListTile(
                              title: Text(
                                '${r['number'] ?? ''} · ${(r['landlord'] as Map?)?['name'] ?? ''}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              subtitle: Text(
                                '${formatPeriod('${r['period'] ?? ''}')} · Net ${formatKes(centsFrom(r['net']))}',
                              ),
                              trailing: StatusChip(
                                status,
                                tone: status == 'PAID'
                                    ? Tone.good
                                    : (status == 'APPROVED'
                                          ? Tone.info
                                          : Tone.neutral),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _addLandlord(BuildContext context, WidgetRef ref) async {
    final nameCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    final emailCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add landlord'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameCtrl,
              decoration: const InputDecoration(labelText: 'Full name'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: phoneCtrl,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone (optional)'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: emailCtrl,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email (optional)'),
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
    if (ok != true || !context.mounted || nameCtrl.text.trim().isEmpty) return;
    try {
      await ref.read(staffApiProvider).createLandlord({
        'name': nameCtrl.text.trim(),
        if (phoneCtrl.text.trim().isNotEmpty) 'phone': phoneCtrl.text.trim(),
        if (emailCtrl.text.trim().isNotEmpty) 'email': emailCtrl.text.trim(),
      });
      ref.invalidate(_landlordsProvider);
      if (context.mounted) showMessage(context, 'Landlord added.');
    } on ApiError catch (e) {
      if (context.mounted) showMessage(context, staffErrorMessage(e));
    }
  }
}

class _LandlordDetailSheet extends StatefulWidget {
  const _LandlordDetailSheet({
    required this.landlord,
    required this.allRemittances,
  });
  final Json landlord;
  final List<Json> allRemittances;

  static Future<void> show(
    BuildContext context, {
    required Json landlord,
    required List<Json> allRemittances,
  }) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => _LandlordDetailSheet(
      landlord: landlord,
      allRemittances: allRemittances,
    ),
  );

  @override
  State<_LandlordDetailSheet> createState() => _LandlordDetailSheetState();
}

class _LandlordDetailSheetState extends State<_LandlordDetailSheet> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final l = widget.landlord;
    final lid = l['id'];
    final rems = widget.allRemittances
        .where((r) => (r['landlord'] as Map?)?['id'] == lid)
        .toList();
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Kicker('${l['code'] ?? 'LANDLORD'}'),
            const SizedBox(height: 4),
            Text(
              '${l['name'] ?? ''}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            KodiHubSegmentedTabs(
              tabs: ['Overview', 'Remittances (${rems.length})'],
              index: _tab,
              onChanged: (i) => setState(() => _tab = i),
            ),
            const SizedBox(height: 12),
            if (_tab == 0)
              SectionCard(
                children: [
                  FactRow('Code', '${l['code'] ?? '—'}'),
                  if (l['phone'] != null) FactRow('Phone', '${l['phone']}'),
                  if (l['email'] != null) FactRow('Email', '${l['email']}'),
                  if (l['payoutMethod'] != null)
                    FactRow('Payout method', '${l['payoutMethod']}'),
                ],
              )
            else
              SectionCard(
                children: [
                  if (rems.isEmpty)
                    const Text(
                      'No remittance statements for this landlord yet.',
                    ),
                  for (final r in rems)
                    FactRow(
                      '${r['number'] ?? ''} · ${formatPeriod('${r['period'] ?? ''}')}',
                      formatKes(centsFrom(r['net'])),
                    ),
                ],
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
final _rolesProvider = FutureProvider.autoDispose<List<Json>>(
  (ref) => ref.watch(staffApiProvider).roles(),
);

class StaffUsersScreen extends ConsumerStatefulWidget {
  const StaffUsersScreen({super.key});

  @override
  ConsumerState<StaffUsersScreen> createState() => _StaffUsersScreenState();
}

class _StaffUsersScreenState extends ConsumerState<StaffUsersScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final users = ref.watch(_usersProvider);
    final roles = ref.watch(_rolesProvider);
    return Scaffold(
      appBar: const KodiHubAppBar(title: Text('Team & roles')),
      floatingActionButton: can(ref, 'users:manage')
          ? FloatingActionButton.extended(
              heroTag: 'fab-users',
              icon: const Icon(Icons.person_add_outlined),
              label: const Text('Invite member'),
              onPressed: () =>
                  _inviteUser(context, roles.valueOrNull ?? const []),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: KodiHubSegmentedTabs(
              tabs: const ['Team members', 'Roles & permissions'],
              index: _tab,
              onChanged: (i) => setState(() => _tab = i),
            ),
          ),
          Expanded(
            child: _tab == 0
                ? AsyncBody(
                    value: users,
                    onRetry: () => ref.invalidate(_usersProvider),
                    data: (rows) => rows.isEmpty
                        ? const EmptyState(title: 'No team members')
                        : ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
                            itemCount: rows.length,
                            itemBuilder: (context, i) {
                              final u = rows[i];
                              final user =
                                  u['user'] as Map<String, dynamic>? ?? u;
                              final role = u['role'] as Map<String, dynamic>?;
                              final fullName =
                                  '${user['firstName'] ?? ''} ${user['lastName'] ?? ''}'
                                      .trim();
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Card(
                                  child: ListTile(
                                    leading: InitialsBadge(
                                      name: fullName.isEmpty ? '?' : fullName,
                                    ),
                                    title: Text(
                                      fullName,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    subtitle: Text(
                                      '${user['email'] ?? user['phone'] ?? ''}',
                                    ),
                                    trailing: StatusChip(
                                      '${role?['name'] ?? u['roleName'] ?? 'Member'}',
                                      tone: Tone.info,
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                  )
                : AsyncBody(
                    value: roles,
                    onRetry: () => ref.invalidate(_rolesProvider),
                    data: (rows) => rows.isEmpty
                        ? const EmptyState(title: 'No roles configured')
                        : ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
                            itemCount: rows.length,
                            itemBuilder: (context, i) {
                              final r = rows[i];
                              final perms =
                                  (r['permissions'] as List?)?.length ?? 0;
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Card(
                                  child: ListTile(
                                    title: Text(
                                      '${r['name'] ?? ''}',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    subtitle: Text(
                                      '${r['description'] ?? '$perms permissions granted'}',
                                    ),
                                    trailing: StatusChip('$perms perms'),
                                  ),
                                ),
                              );
                            },
                          ),
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _inviteUser(BuildContext context, List<Json> roles) async {
    final emailCtrl = TextEditingController();
    String? roleId = roles.isNotEmpty ? '${roles.first['id']}' : null;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Invite team member'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email address'),
              ),
              if (roles.isNotEmpty) ...[
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: roleId,
                  decoration: const InputDecoration(labelText: 'Role'),
                  items: [
                    for (final r in roles)
                      DropdownMenuItem(
                        value: '${r['id']}',
                        child: Text('${r['name']}'),
                      ),
                  ],
                  onChanged: (v) => setDialogState(() => roleId = v),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Send invite'),
            ),
          ],
        ),
      ),
    );
    if (ok != true ||
        !context.mounted ||
        emailCtrl.text.trim().isEmpty ||
        roleId == null) {
      return;
    }
    try {
      await ref.read(staffApiProvider).inviteUser({
        'email': emailCtrl.text.trim(),
        'roleId': roleId,
      });
      ref.invalidate(_usersProvider);
      if (context.mounted) showMessage(context, 'Invitation sent.');
    } on ApiError catch (e) {
      if (context.mounted) showMessage(context, staffErrorMessage(e));
    }
  }
}
