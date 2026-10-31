import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_error.dart';
import '../../../core/dates.dart';
import '../../../core/files.dart';
import '../../../core/money.dart';
import '../../../core/providers.dart';
import '../../../core/widgets/common.dart';
import '../../../core/widgets/paged_list.dart';
import '../money/money_screens.dart';
import '../staff_api.dart';
import '../staff_models.dart';
import '../staff_widgets.dart';

/// The units list's filters, and the query they send to `GET /units`.
class UnitFilter {
  const UnitFilter({this.q = '', this.propertyId, this.occupancy});
  final String q;
  final String? propertyId;

  /// OCCUPIED ("Let"), NOTICE, VACANT, or null for all.
  final String? occupancy;

  UnitFilter copy({
    String? q,
    String? Function()? propertyId,
    String? Function()? occupancy,
  }) => UnitFilter(
    q: q ?? this.q,
    propertyId: propertyId != null ? propertyId() : this.propertyId,
    occupancy: occupancy != null ? occupancy() : this.occupancy,
  );

  @override
  bool operator ==(Object other) =>
      other is UnitFilter &&
      other.q == q &&
      other.propertyId == propertyId &&
      other.occupancy == occupancy;

  @override
  int get hashCode => Object.hash(q, propertyId, occupancy);
}

/// Units tab: search, property and let/vacant filters, infinite list.
class UnitsScreen extends ConsumerStatefulWidget {
  const UnitsScreen({super.key});
  @override
  ConsumerState<UnitsScreen> createState() => _UnitsScreenState();
}

class _UnitsScreenState extends ConsumerState<UnitsScreen> {
  var _filter = const UnitFilter();

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(staffApiProvider);
    final version = ref.watch(listsVersionProvider);
    final canProperties = can(ref, 'properties:view');
    final properties = canProperties
        ? ref.watch(propertiesProvider).valueOrNull
        : null;
    return StaffTabScaffold(
      title: 'Units',
      floatingActionButton: can(ref, 'units:create')
          ? FloatingActionButton.extended(
              heroTag: 'fab-units',
              icon: const Icon(Icons.add),
              label: const Text('Add unit'),
              onPressed: () => _UnitFormSheet.show(context),
            )
          : null,
      body: !can(ref, 'units:view')
          ? const NoPermission('units')
          : Column(
              children: [
                SearchField(
                  hint: 'Unit number, or tenant name or phone',
                  onChanged: (v) =>
                      setState(() => _filter = _filter.copy(q: v)),
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
                        for (final (value, label) in const [
                          (null, 'All'),
                          ('OCCUPIED', 'Let'),
                          ('NOTICE', 'On notice'),
                          ('VACANT', 'Vacant'),
                        ])
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                              label: Text(label),
                              selected: _filter.occupancy == value,
                              onSelected: (_) => setState(
                                () => _filter = _filter.copy(
                                  occupancy: () => value,
                                ),
                              ),
                            ),
                          ),
                        if (properties != null && properties.length > 1)
                          _PropertyChip(
                            properties: properties,
                            selected: _filter.propertyId,
                            onChanged: (id) => setState(
                              () =>
                                  _filter = _filter.copy(propertyId: () => id),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                Expanded(
                  child: PagedList<UnitRow>(
                    resetKey: (_filter, version),
                    load: (page) async {
                      final f = _filter;
                      final p = await api.units(
                        page: page,
                        q: f.q,
                        propertyId: f.propertyId,
                        occupancy: f.occupancy,
                      );
                      return (rows: p.rows, hasMore: p.hasMore);
                    },
                    empty: const EmptyState(
                      icon: Icons.door_front_door_outlined,
                      title: 'No units match',
                      body: 'Add a unit or adjust your search filters.',
                    ),
                    itemBuilder: (context, u) => ListTile(
                      leading: UnitBadge(u.number),
                      title: Text(
                        '${u.number} · ${u.property.name}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        u.tenancy == null
                            ? '${formatKes(u.rentAmount)} / mo'
                            : '${u.tenancy!.tenant.name} · ${formatKes(u.rentAmount)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: StatusChip(
                        occupancyLabel[u.occupancy] ?? u.occupancy,
                        tone: occupancyTone(u.occupancy),
                      ),
                      onTap: () => context.push('/staff/units/${u.id}'),
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class _PropertyChip extends StatelessWidget {
  const _PropertyChip({
    required this.properties,
    required this.selected,
    required this.onChanged,
  });
  final List<PropertyOption> properties;
  final String? selected;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    String? name;
    for (final p in properties) {
      if (p.id == selected) name = p.name;
    }
    return InputChip(
      avatar: const Icon(Icons.apartment_outlined, size: 18),
      label: Text(name ?? 'All properties'),
      selected: selected != null,
      onDeleted: selected == null ? null : () => onChanged(null),
      deleteButtonTooltipMessage: 'Show all properties',
      onPressed: () async {
        final picked = await showModalBottomSheet<String>(
          context: context,
          useRootNavigator: true,
          showDragHandle: true,
          builder: (ctx) => ListView(
            shrinkWrap: true,
            children: [
              ListTile(
                title: const Text('All properties'),
                onTap: () => Navigator.of(ctx).pop(''),
              ),
              for (final p in properties)
                ListTile(
                  title: Text(p.name),
                  subtitle: Text(p.code),
                  selected: p.id == selected,
                  onTap: () => Navigator.of(ctx).pop(p.id),
                ),
            ],
          ),
        );
        if (picked != null) onChanged(picked.isEmpty ? null : picked);
      },
    );
  }
}

/// One unit: current tenancy, tenant, rent and balance; tap through to the tenant.
class UnitDetailScreen extends ConsumerWidget {
  const UnitDetailScreen({super.key, required this.unitId});
  final String unitId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unit = ref.watch(unitProvider(unitId));
    return Scaffold(
      appBar: KodiHubAppBar(
        title: Text(
          unit.valueOrNull == null ? 'Unit' : 'Unit ${unit.value!.number}',
        ),
        subtitle: unit.valueOrNull?.property.name,
        actions: [
          if (unit.valueOrNull != null && can(ref, 'units:update'))
            IconButton(
              tooltip: 'Edit unit',
              icon: const Icon(Icons.edit_outlined),
              onPressed: () =>
                  _UnitFormSheet.show(context, existing: unit.valueOrNull),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(unitProvider(unitId));
          ref.invalidate(tenancyProvider);
          ref.invalidate(tenantProvider);
        },
        child: AsyncBody(
          value: unit,
          onRetry: () => ref.invalidate(unitProvider(unitId)),
          data: (u) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              SectionCard(
                title: '${u.number} · ${u.property.name}',
                trailing: StatusChip(
                  occupancyLabel[u.occupancy] ?? u.occupancy,
                  tone: occupancyTone(u.occupancy),
                ),
                children: [
                  if (u.unitType != null) FactRow('Type', u.unitType!),
                  if (u.floor != null)
                    FactRow('Floor', u.floor == 0 ? 'Ground' : '${u.floor}'),
                  FactRow('Rent (default)', formatKes(u.rentAmount)),
                  if (u.status != 'ACTIVE') const FactRow('Status', 'Inactive'),
                ],
              ),
              const SizedBox(height: 12),
              if (u.tenancy == null)
                SectionCard(
                  title: 'Current tenancy',
                  children: [
                    const Text('Vacant.'),
                    if (can(ref, 'tenancies:create')) ...[
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        icon: const Icon(Icons.person_add_alt_1_outlined),
                        label: const Text('Move in a tenant'),
                        onPressed: () => _MoveInSheet.show(context, u),
                      ),
                    ],
                  ],
                )
              else
                _CurrentTenancy(u),
            ],
          ),
        ),
      ),
    );
  }
}

class _CurrentTenancy extends ConsumerWidget {
  const _CurrentTenancy(this.u);
  final UnitRow u;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = u.tenancy!;
    final tenancy = can(ref, 'tenancies:view')
        ? ref.watch(tenancyProvider(t.id)).valueOrNull
        : null;
    final canTenants = can(ref, 'tenants:view');
    final tenant = canTenants
        ? ref.watch(tenantProvider(t.tenant.id)).valueOrNull
        : null;
    final balance = tenant?.balance;
    return SectionCard(
      title: 'Current tenancy',
      trailing: t.status == 'NOTICE'
          ? const StatusChip('On notice', tone: Tone.warn)
          : null,
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.person_outline),
          title: Text(t.tenant.name),
          subtitle: Text('${t.tenant.code} · ${t.tenant.phone}'),
          trailing: canTenants ? const Icon(Icons.chevron_right) : null,
          onTap: canTenants
              ? () => context.push('/staff/tenants/${t.tenant.id}')
              : null,
        ),
        FactRow('Moved in', formatDay(t.startDate)),
        if (t.endDate != null) FactRow('Moving out', formatDay(t.endDate)),
        if (tenancy != null) ...[
          FactRow('Rent', formatKes(tenancy.rentAmount)),
          FactRow('Billed on day', '${tenancy.billingDay}'),
          FactRow('Deposit held', formatKes(tenancy.depositHeld)),
        ],
        if (balance != null)
          FactRow(
            balance < 0 ? 'In credit' : 'Balance',
            formatKes(balance.abs()),
            bold: true,
          ),
        if (can(ref, 'tenancies:view') || can(ref, 'tenancies:update')) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (can(ref, 'tenancies:view')) ...[
                OutlinedButton.icon(
                  icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
                  label: const Text('Lease PDF'),
                  onPressed: () => openApiPdf(
                    ref.read(apiClientProvider),
                    '/tenancies/${t.id}/lease/pdf',
                    'Lease-${u.number}.pdf',
                  ),
                ),
                if (tenancy?.hasSignedLease == true || t.hasSignedLease)
                  OutlinedButton.icon(
                    icon: const Icon(Icons.verified_outlined, size: 18),
                    label: const Text('Signed lease'),
                    onPressed: () => openApiPdf(
                      ref.read(apiClientProvider),
                      '/tenancies/${t.id}/lease-document',
                      'Signed-Lease-${u.number}.pdf',
                    ),
                  ),
              ],
              if (can(ref, 'tenancies:update') && t.status == 'ACTIVE')
                OutlinedButton(
                  onPressed: () => _TenancyLifecycleSheet.giveNotice(
                    context,
                    ref,
                    tenancyId: t.id,
                    unitId: u.id,
                    tenantId: t.tenant.id,
                  ),
                  child: const Text('Give notice'),
                ),
              if (can(ref, 'tenancies:update') &&
                  (t.status == 'ACTIVE' || t.status == 'NOTICE'))
                OutlinedButton(
                  onPressed: () => _TenancyLifecycleSheet.moveOut(
                    context,
                    ref,
                    tenancyId: t.id,
                    unitId: u.id,
                    tenantId: t.tenant.id,
                  ),
                  child: const Text('Move out'),
                ),
              if (can(ref, 'tenancies:update') &&
                  (tenancy?.depositHeld ?? 0) > 0)
                OutlinedButton(
                  onPressed: () => _TenancyLifecycleSheet.settleDeposit(
                    context,
                    ref,
                    tenancyId: t.id,
                    unitId: u.id,
                    tenantId: t.tenant.id,
                    depositHeld: tenancy!.depositHeld,
                  ),
                  child: const Text('Settle deposit'),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _UnitFormSheet extends ConsumerStatefulWidget {
  const _UnitFormSheet({this.existing});
  final UnitRow? existing;

  static Future<void> show(BuildContext context, {UnitRow? existing}) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => _UnitFormSheet(existing: existing),
      );

  @override
  ConsumerState<_UnitFormSheet> createState() => _UnitFormSheetState();
}

class _UnitFormSheetState extends ConsumerState<_UnitFormSheet> {
  final _number = TextEditingController();
  final _floor = TextEditingController();
  final _rent = TextEditingController();
  String? _propertyId;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    if (e != null) {
      _number.text = e.number;
      if (e.floor != null) _floor.text = '${e.floor}';
      _rent.text = '${e.rentAmount ~/ 100}';
      _propertyId = e.property.id;
    }
  }

  @override
  void dispose() {
    _number.dispose();
    _floor.dispose();
    _rent.dispose();
    super.dispose();
  }

  Future<void> _save(List<PropertyOption> properties) async {
    final propId =
        _propertyId ?? (properties.length == 1 ? properties.first.id : null);
    final cents = parseKes(_rent.text);
    if (propId == null || _number.text.trim().isEmpty || cents == null) {
      setState(
        () => _error = 'Choose a property, unit number and monthly rent.',
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final api = ref.read(staffApiProvider);
    final floorVal = int.tryParse(_floor.text.trim());
    try {
      if (widget.existing == null) {
        await api.createUnit({
          'propertyId': propId,
          'number': _number.text.trim(),
          'floor': ?floorVal,
          'rentAmount': cents,
        });
      } else {
        await api.updateUnit(widget.existing!.id, {
          'number': _number.text.trim(),
          'floor': ?floorVal,
          'rentAmount': cents,
        });
        ref.invalidate(unitProvider(widget.existing!.id));
      }
      ref.read(listsVersionProvider.notifier).state++;
      ref.invalidate(dashboardProvider);
      if (mounted) {
        showMessage(
          context,
          widget.existing == null ? 'Unit created.' : 'Unit updated.',
        );
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
              widget.existing == null ? 'Add unit' : 'Edit unit',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 14),
            if (widget.existing == null) ...[
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
            ],
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _number,
                    decoration: const InputDecoration(
                      labelText: 'Unit number',
                      hintText: 'e.g. A1',
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _floor,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Floor (optional)',
                      hintText: '0 = Ground',
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _rent,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Default monthly rent (KES)',
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              ErrorBox(_error!),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _saving ? null : () => _save(properties),
              child: Text(_saving ? 'Saving…' : 'Save unit'),
            ),
          ],
        ),
      ),
    );
  }
}

class _MoveInSheet extends ConsumerStatefulWidget {
  const _MoveInSheet({required this.unit});
  final UnitRow unit;

  static Future<void> show(BuildContext context, UnitRow unit) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (_) => _MoveInSheet(unit: unit),
      );

  @override
  ConsumerState<_MoveInSheet> createState() => _MoveInSheetState();
}

class _MoveInSheetState extends ConsumerState<_MoveInSheet> {
  TenantRef? _tenant;
  late final _rent = TextEditingController(
    text: '${widget.unit.rentAmount ~/ 100}',
  );
  final _deposit = TextEditingController(text: '0');
  final _billingDay = TextEditingController(text: '1');
  late DateTime _startDate = nairobiToday();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _rent.dispose();
    _deposit.dispose();
    _billingDay.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final rentCents = parseKes(_rent.text);
    final depositCents = parseKes(_deposit.text) ?? 0;
    final day = int.tryParse(_billingDay.text.trim()) ?? 1;
    if (_tenant == null || rentCents == null || rentCents <= 0) {
      setState(() => _error = 'Choose a tenant and enter the monthly rent.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(staffApiProvider).createTenancy({
        'unitId': widget.unit.id,
        'tenantId': _tenant!.id,
        'startDate': toDay(_startDate),
        'rentAmount': rentCents,
        'depositRequired': depositCents,
        'billingDay': day.clamp(1, 28),
      });
      ref.invalidate(unitProvider(widget.unit.id));
      ref.invalidate(tenantProvider(_tenant!.id));
      ref.invalidate(dashboardProvider);
      ref.read(listsVersionProvider.notifier).state++;
      if (mounted) {
        showMessage(context, 'Moved in ${_tenant!.name}.');
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
              'Move in · Unit ${widget.unit.number}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              icon: const Icon(Icons.person_search_outlined),
              label: Text(
                _tenant == null
                    ? 'Choose tenant'
                    : '${_tenant!.name} (${_tenant!.code})',
              ),
              onPressed: () async {
                final picked = await showModalBottomSheet<TenantRef>(
                  context: context,
                  isScrollControlled: true,
                  useSafeArea: true,
                  showDragHandle: true,
                  builder: (_) => const TenantPicker(),
                );
                if (picked != null) setState(() => _tenant = picked);
              },
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _rent,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: const InputDecoration(
                      labelText: 'Monthly rent (KES)',
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _deposit,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: const InputDecoration(
                      labelText: 'Deposit (KES)',
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
                    controller: _billingDay,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Billing day (1-28)',
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: InkWell(
                    onTap: () async {
                      final d = await showDatePicker(
                        context: context,
                        initialDate: _startDate,
                        firstDate: DateTime(2020),
                        lastDate: DateTime(2035),
                      );
                      if (d != null) setState(() => _startDate = d);
                    },
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Move-in date',
                      ),
                      child: Text(formatDay(toDay(_startDate))),
                    ),
                  ),
                ),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              ErrorBox(_error!),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'Moving in…' : 'Confirm move-in'),
            ),
          ],
        ),
      ),
    );
  }
}

class _TenancyLifecycleSheet {
  static Future<void> giveNotice(
    BuildContext context,
    WidgetRef ref, {
    required String tenancyId,
    required String unitId,
    required String tenantId,
  }) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: nairobiToday().add(const Duration(days: 30)),
      firstDate: nairobiToday(),
      lastDate: DateTime(2035),
      helpText: 'Expected move-out date',
    );
    if (picked == null || !context.mounted) return;
    try {
      await ref.read(staffApiProvider).giveNotice(tenancyId, {
        'noticeDate': toDay(nairobiToday()),
        'endDate': toDay(picked),
      });
      ref.invalidate(unitProvider(unitId));
      ref.invalidate(tenancyProvider(tenancyId));
      ref.invalidate(tenantProvider(tenantId));
      ref.read(listsVersionProvider.notifier).state++;
      if (context.mounted) showMessage(context, 'Notice recorded.');
    } on ApiError catch (e) {
      if (context.mounted) showMessage(context, staffErrorMessage(e));
    }
  }

  static Future<void> moveOut(
    BuildContext context,
    WidgetRef ref, {
    required String tenancyId,
    required String unitId,
    required String tenantId,
  }) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: nairobiToday(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
      helpText: 'Move-out date',
    );
    if (picked == null || !context.mounted) return;
    try {
      await ref.read(staffApiProvider).endTenancy(tenancyId, {
        'endDate': toDay(picked),
      });
      ref.invalidate(unitProvider(unitId));
      ref.invalidate(tenancyProvider(tenancyId));
      ref.invalidate(tenantProvider(tenantId));
      ref.invalidate(dashboardProvider);
      ref.read(listsVersionProvider.notifier).state++;
      if (context.mounted) showMessage(context, 'Tenancy ended.');
    } on ApiError catch (e) {
      if (context.mounted) showMessage(context, staffErrorMessage(e));
    }
  }

  static Future<void> settleDeposit(
    BuildContext context,
    WidgetRef ref, {
    required String tenancyId,
    required String unitId,
    required String tenantId,
    required int depositHeld,
  }) async {
    final applyCtrl = TextEditingController(text: '0');
    final refundCtrl = TextEditingController(text: '${depositHeld ~/ 100}');
    final forfeitCtrl = TextEditingController(text: '0');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Settle deposit (${formatKes(depositHeld)})'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: applyCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Apply to open invoices (KES)',
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: refundCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Refund to tenant (KES)',
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: forfeitCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Retain / forfeit for repairs (KES)',
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
            child: const Text('Settle'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await ref.read(staffApiProvider).settleDeposit(tenancyId, {
        'applyToInvoices': parseKes(applyCtrl.text) ?? 0,
        'refunded': parseKes(refundCtrl.text) ?? 0,
        'forfeited': parseKes(forfeitCtrl.text) ?? 0,
      });
      ref.invalidate(unitProvider(unitId));
      ref.invalidate(tenancyProvider(tenancyId));
      invalidateAfterPayment(ref, tenantId: tenantId);
      if (context.mounted) showMessage(context, 'Deposit settled.');
    } on ApiError catch (e) {
      if (context.mounted) showMessage(context, staffErrorMessage(e));
    }
  }
}
