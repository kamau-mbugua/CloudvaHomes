import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/dates.dart';
import '../../../core/money.dart';
import '../../../core/widgets/common.dart';
import '../../../core/widgets/paged_list.dart';
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
                      body: 'Units are set up on the web app.',
                    ),
                    itemBuilder: (context, u) => ListTile(
                      title: Text('${u.number} · ${u.property.name}'),
                      subtitle: Text(
                        u.tenancy?.tenant.name ?? formatKes(u.rentAmount),
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
      appBar: AppBar(
        title: Text(
          unit.valueOrNull == null ? 'Unit' : 'Unit ${unit.value!.number}',
        ),
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
                const SectionCard(
                  title: 'Current tenancy',
                  children: [
                    Text('Vacant. Tenants are moved in on the web app.'),
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
      ],
    );
  }
}
