import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart' hide Page;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:printing/printing.dart';

import '../../core/api/api_error.dart';
import '../../core/dates.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/profile_sheets.dart';
import '../account/delete_account_screen.dart';
import '../host/detail_ui.dart';
import 'home_scope.dart';
import 'tenant_api.dart';

/// Documents, Notices and My profile (tenant portal). Documents and Notices follow the home
/// switcher; My profile is about the person.

// ───────────────────────────── Documents ─────────────────────────────

final _inspectionsProvider = FutureProvider.autoDispose
    .family<List<TenantInspection>, ({String tenantId, String tenancyId})>(
      (ref, k) =>
          ref.watch(tenantApiProvider).inspections(k.tenantId, k.tenancyId),
    );

/// A PDF's bytes, shared by its thumbnail and its preview (downloaded once while either shows).
final _pdfProvider = FutureProvider.autoDispose.family<Uint8List, String>(
  (ref, path) => ref.watch(apiClientProvider).bytes(path),
);

/// The first page as a small picture. Uses the phone's own PDF renderer; null when it can't
/// (the tile then shows a plain PDF icon).
final _thumbProvider = FutureProvider.autoDispose.family<ui.Image?, String>((
  ref,
  path,
) async {
  final bytes = await ref.watch(_pdfProvider(path).future);
  try {
    // A renderer that never answers mustn't leave the tile spinning.
    final page = await Printing.raster(
      bytes,
      pages: const [0],
      dpi: 40,
    ).first.timeout(const Duration(seconds: 8));
    return await page.toImage();
  } catch (_) {
    // No renderer (tests, unusual devices) or not a PDF: the tile shows an icon instead.
  }
  return null;
});

/// One document of a home: where it comes from and what it's called.
class TenantDoc {
  const TenantDoc({
    required this.title,
    required this.subtitle,
    required this.path,
    required this.fileName,
    this.inspection,
  });

  final String title;
  final String subtitle;
  final String path;
  final String fileName;

  /// Set for inspection reports, which the tenant is asked to check.
  final TenantInspection? inspection;
}

List<TenantDoc> docsFor(
  Home home,
  TenantApi api,
  List<TenantInspection> inspections,
) {
  final base = api.base(home.tenantId);
  final tenancy = Uri.encodeComponent(home.id);
  return [
    TenantDoc(
      title: 'Lease agreement',
      subtitle: home.leaseEndDate != null
          ? 'Ends ${formatDay(home.leaseEndDate)}'
          : 'From ${formatDay(home.startDate)}',
      path: '$base/tenancies/$tenancy/lease/pdf',
      fileName: 'Lease ${home.unit}.pdf',
    ),
    if (home.hasSignedLease)
      TenantDoc(
        title: 'Signed lease',
        subtitle: 'The copy you signed',
        path: '$base/tenancies/$tenancy/lease-document',
        fileName: 'Signed lease ${home.unit}.pdf',
      ),
    for (final i in inspections)
      TenantDoc(
        title: i.kind == 'MOVE_OUT'
            ? 'Move-out inspection'
            : 'Move-in inspection',
        subtitle: formatDay(i.inspectedOn),
        path: '${api.inspectionsPath(home.tenantId, home.id)}/${i.kind}/pdf',
        fileName:
            '${i.kind == 'MOVE_OUT' ? 'Move-out' : 'Move-in'} inspection ${home.unit}.pdf',
        inspection: i,
      ),
  ];
}

class TenantDocumentsScreen extends ConsumerWidget {
  const TenantDocumentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final all = ref.watch(allHomesProvider);
    final scope = ref.watch(homeScopeProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Documents')),
      body: all.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(messageOf(e))),
        data: (o) {
          final homes = [
            for (final h in o.homes)
              if ((h.status == 'ACTIVE' || h.status == 'NOTICE') &&
                  (scope is AllHomes ||
                      (scope is OneHome && scope.tenancyId == h.id)))
                h,
          ];
          if (homes.isEmpty) {
            return const _Empty(
              icon: Icons.folder_open_outlined,
              text: 'No documents yet: you don’t have a current home.',
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            children: [
              for (final h in homes) ...[
                _HomeDocuments(home: h),
                const SizedBox(height: 20),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _HomeDocuments extends ConsumerWidget {
  const _HomeDocuments({required this.home});
  final Home home;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(tenantApiProvider);
    final key = (tenantId: home.tenantId, tenancyId: home.id);
    final inspections =
        ref.watch(_inspectionsProvider(key)).valueOrNull ??
        const <TenantInspection>[];
    final docs = docsFor(home, api, inspections);
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          homeLabel(home),
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        Text(home.orgName, style: TextStyle(fontSize: 13, color: muted)),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, c) {
            final cols = c.maxWidth >= 520 ? 3 : 2;
            final w = (c.maxWidth - 12 * (cols - 1)) / cols;
            return Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                for (final d in docs)
                  SizedBox(
                    width: w,
                    child: _DocTile(
                      doc: d,
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => DocumentPreviewScreen(
                            doc: d,
                            onChecked: d.inspection == null
                                ? null
                                : () async {
                                    await api.acknowledgeInspection(
                                      home.tenantId,
                                      home.id,
                                      d.inspection!.kind,
                                    );
                                    ref.invalidate(_inspectionsProvider(key));
                                  },
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _DocTile extends ConsumerWidget {
  const _DocTile({required this.doc, required this.onTap});

  final TenantDoc doc;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final thumb = ref.watch(_thumbProvider(doc.path));
    final toCheck = doc.inspection != null && !doc.inspection!.acknowledged;
    return Semantics(
      button: true,
      label: '${doc.title}, ${doc.subtitle}. Open preview',
      excludeSemantics: true,
      child: Material(
        color: cs.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            decoration: BoxDecoration(
              border: Border.all(color: cs.outlineVariant),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AspectRatio(
                  aspectRatio: 1 / 1.1,
                  child: Container(
                    color: const Color(0xFFEEF2F7),
                    padding: const EdgeInsets.fromLTRB(14, 14, 14, 0),
                    child: Align(
                      alignment: Alignment.topCenter,
                      child: _Page(thumb: thumb),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        doc.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        doc.subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          color: cs.onSurfaceVariant,
                        ),
                      ),
                      if (doc.inspection != null) ...[
                        const SizedBox(height: 8),
                        DetailPill(
                          toCheck ? 'Please check' : 'Checked',
                          tone: toCheck ? 'warn' : 'ok',
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The page sheet in a tile: the real first page once rendered, a PDF icon otherwise.
class _Page extends StatelessWidget {
  const _Page({required this.thumb});

  final AsyncValue<ui.Image?> thumb;

  @override
  Widget build(BuildContext context) {
    final image = thumb.valueOrNull;
    return AspectRatio(
      aspectRatio: 1 / 1.414,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.08),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
          child: image != null
              ? RawImage(
                  image: image,
                  fit: BoxFit.cover,
                  alignment: Alignment.topCenter,
                )
              : Center(
                  child: thumb.isLoading
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(
                          Icons.picture_as_pdf_outlined,
                          size: 32,
                          color: HodiColors.danger,
                        ),
                ),
        ),
      ),
    );
  }
}

/// A document full screen, page by page, with share and print; inspection reports also get
/// "I've checked this".
class DocumentPreviewScreen extends ConsumerStatefulWidget {
  const DocumentPreviewScreen({super.key, required this.doc, this.onChecked});

  final TenantDoc doc;
  final Future<void> Function()? onChecked;

  @override
  ConsumerState<DocumentPreviewScreen> createState() =>
      _DocumentPreviewScreenState();
}

class _DocumentPreviewScreenState extends ConsumerState<DocumentPreviewScreen> {
  late bool _checked = widget.doc.inspection?.acknowledged ?? true;
  bool _busy = false;

  Future<void> _check() async {
    setState(() => _busy = true);
    try {
      await widget.onChecked!();
      if (!mounted) return;
      setState(() => _checked = true);
      showMessage(context, 'Thanks: marked as checked.');
    } catch (e) {
      if (mounted) showMessage(context, messageOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pdf = ref.watch(_pdfProvider(widget.doc.path));
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.doc.title),
            Text(
              widget.doc.subtitle,
              style: const TextStyle(fontSize: 13, color: Color(0xFFC9D6E5)),
            ),
          ],
        ),
      ),
      body: pdf.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _Empty(
          icon: Icons.cloud_off_outlined,
          text: messageOf(e),
          action: TextButton(
            onPressed: () => ref.invalidate(_pdfProvider(widget.doc.path)),
            child: const Text('Try again'),
          ),
        ),
        data: (bytes) => PdfPreview(
          build: (_) => bytes,
          pdfFileName: widget.doc.fileName,
          allowPrinting: true,
          allowSharing: true,
          canChangePageFormat: false,
          canChangeOrientation: false,
          canDebug: false,
          useActions: true,
          scrollViewDecoration: const BoxDecoration(color: Color(0xFFEEF2F7)),
          loadingWidget: const CircularProgressIndicator(),
          onError: (_, _) => const _Empty(
            icon: Icons.picture_as_pdf_outlined,
            text: 'This phone can’t show the preview. Use share to open it.',
          ),
        ),
      ),
      bottomNavigationBar: widget.onChecked == null || _checked
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: FilledButton.icon(
                  key: const Key('doc-checked'),
                  onPressed: _busy ? null : _check,
                  icon: const Icon(Icons.check),
                  label: Text(_busy ? 'Saving…' : 'I’ve checked this'),
                ),
              ),
            ),
    );
  }
}

// ───────────────────────────── Notices ─────────────────────────────

final tenantNoticesProvider = FutureProvider.autoDispose
    .family<Page<TenantNotice>, String?>(
      (ref, tenantId) =>
          ref.watch(tenantApiProvider).notices(tenantId: tenantId),
    );

/// Icon and colours for a notice, from its kind.
({IconData icon, Color fg, Color bg}) noticeLook(String kind) {
  final k = kind.toUpperCase();
  if (k.contains('OVERDUE') || k.contains('LATE')) {
    return (
      icon: Icons.warning_amber_rounded,
      fg: HodiColors.danger,
      bg: HodiColors.dangerSoft,
    );
  }
  if (k.contains('PAYMENT') || k.contains('RECEIPT') || k.contains('REFUND')) {
    return (
      icon: Icons.check_circle_outline,
      fg: HodiColors.success,
      bg: HodiColors.successSoft,
    );
  }
  if (k.contains('INVOICE')) {
    return (
      icon: Icons.receipt_long_outlined,
      fg: HodiColors.navy,
      bg: const Color(0xFFEEF2F7),
    );
  }
  if (k.contains('REMINDER') || k.contains('DUE')) {
    return (
      icon: Icons.schedule,
      fg: HodiColors.warning,
      bg: HodiColors.warningSoft,
    );
  }
  if (k.contains('RENT_CHANGE')) {
    return (
      icon: Icons.trending_up,
      fg: HodiColors.warning,
      bg: HodiColors.warningSoft,
    );
  }
  if (k.contains('MAINTENANCE')) {
    return (
      icon: Icons.build_outlined,
      fg: HodiColors.info,
      bg: const Color(0xFFE8F0F8),
    );
  }
  if (k.contains('NOTICE') || k.contains('LEASE') || k.contains('ENDING')) {
    return (
      icon: Icons.event_outlined,
      fg: HodiColors.info,
      bg: const Color(0xFFE8F0F8),
    );
  }
  return (
    icon: Icons.campaign_outlined,
    fg: HodiColors.limeText,
    bg: HodiColors.limeSoft,
  );
}

/// "Today", "Yesterday", "Mon 3 Nov" or "3 Nov 2025".
String noticeDayLabel(DateTime day, DateTime now) {
  final d = DateTime(day.year, day.month, day.day);
  final today = DateTime(now.year, now.month, now.day);
  final diff = today.difference(d).inDays;
  if (diff == 0) return 'Today';
  if (diff == 1) return 'Yesterday';
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  if (diff < 7) return '${days[d.weekday - 1]} ${d.day} ${months[d.month - 1]}';
  return d.year == today.year
      ? '${d.day} ${months[d.month - 1]}'
      : '${d.day} ${months[d.month - 1]} ${d.year}';
}

class TenantNoticesScreen extends ConsumerStatefulWidget {
  const TenantNoticesScreen({super.key});

  @override
  ConsumerState<TenantNoticesScreen> createState() =>
      _TenantNoticesScreenState();
}

class _TenantNoticesScreenState extends ConsumerState<TenantNoticesScreen> {
  /// Read on this screen since it loaded (the server is told too).
  final _readHere = <String>{};

  String? get _tenantId {
    final scope = ref.read(homeScopeProvider);
    return scope is OneHome ? scope.tenantId : null;
  }

  Future<void> _markRead(TenantNotice n) async {
    if (n.read || _readHere.contains(n.id)) return;
    setState(() => _readHere.add(n.id));
    try {
      await ref.read(apiClientProvider).post('/notifications/${n.id}/read');
    } on ApiError {
      // Only the dot is at stake; it'll show as unread next time.
    }
  }

  Future<void> _markAllRead(List<TenantNotice> rows) async {
    setState(() => _readHere.addAll(rows.map((n) => n.id)));
    try {
      await ref.read(apiClientProvider).post('/notifications/read-all');
    } on ApiError catch (e) {
      if (mounted) showMessage(context, e.message);
    }
  }

  void _open(TenantNotice n) {
    _markRead(n);
    final link = n.actionUrl;
    if (link == null) return;
    if (link == '/tenant' || link.startsWith('/tenant/')) {
      context.go(
        link.startsWith('/tenant/invoices/') ? '/tenant/invoices' : link,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(homeScopeProvider);
    final notices = ref.watch(tenantNoticesProvider(_tenantId));
    final rows = notices.valueOrNull?.rows ?? const <TenantNotice>[];
    final unread = rows.where((n) => !n.read && !_readHere.contains(n.id));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notices'),
        actions: [
          if (unread.isNotEmpty)
            TextButton(
              onPressed: () => _markAllRead(rows),
              style: TextButton.styleFrom(foregroundColor: Colors.white),
              child: const Text('Mark all read'),
            ),
        ],
      ),
      body: notices.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(messageOf(e))),
        data: (page) {
          if (page.rows.isEmpty) {
            return const _Empty(
              icon: Icons.notifications_none,
              text:
                  'No notices yet. Invoices, receipts and messages from your landlord show up here.',
            );
          }
          final now = DateTime.now();
          final items = <Widget>[];
          String? lastDay;
          for (final n in page.rows) {
            final at = DateTime.tryParse(n.createdAt)?.toLocal();
            final day = at == null ? '' : noticeDayLabel(at, now);
            if (day != lastDay) {
              items.add(_DayHeader(day));
              lastDay = day;
            }
            items.add(
              _NoticeTile(
                notice: n,
                at: at,
                unread: !n.read && !_readHere.contains(n.id),
                onTap: () => _open(n),
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () async {
              _readHere.clear();
              ref.invalidate(tenantNoticesProvider(_tenantId));
              await ref.read(tenantNoticesProvider(_tenantId).future);
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              children: items,
            ),
          );
        },
      ),
    );
  }
}

class _DayHeader extends StatelessWidget {
  const _DayHeader(this.label);
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
    child: Text(
      label.toUpperCase(),
      style: TextStyle(
        fontSize: 11.5,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.8,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
      ),
    ),
  );
}

class _NoticeTile extends StatelessWidget {
  const _NoticeTile({
    required this.notice,
    required this.at,
    required this.unread,
    required this.onTap,
  });

  final TenantNotice notice;
  final DateTime? at;
  final bool unread;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final look = noticeLook(notice.kind);
    final time = at == null
        ? ''
        : '${at!.hour.toString().padLeft(2, '0')}:${at!.minute.toString().padLeft(2, '0')}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: unread ? cs.surfaceContainerLowest : Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          key: Key('notice-${notice.id}'),
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: unread
                    ? cs.outlineVariant
                    : cs.outlineVariant.withValues(alpha: 0.5),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: look.bg,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(look.icon, size: 20, color: look.fg),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Text(
                              notice.title,
                              style: TextStyle(
                                fontSize: 14.5,
                                fontWeight: unread
                                    ? FontWeight.w600
                                    : FontWeight.w500,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            time,
                            style: TextStyle(
                              fontSize: 12,
                              color: cs.onSurfaceVariant,
                            ),
                          ),
                          if (unread) ...[
                            const SizedBox(width: 6),
                            Semantics(
                              label: 'Unread',
                              child: Container(
                                key: Key('unread-${notice.id}'),
                                margin: const EdgeInsets.only(top: 5),
                                width: 8,
                                height: 8,
                                decoration: const BoxDecoration(
                                  color: HodiColors.lime,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      if (notice.body.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          notice.body,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            height: 1.4,
                            color: cs.onSurfaceVariant,
                          ),
                        ),
                      ],
                      if (notice.orgName != null) ...[
                        const SizedBox(height: 8),
                        DetailPill(notice.orgName!),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ───────────────────────────── My profile ─────────────────────────────

/// Who you are, at a glance; each change opens its own sheet.
class TenantProfileScreen extends ConsumerWidget {
  const TenantProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).valueOrNull;
    final user = session?.user;
    final accounts = session?.tenantOf ?? const [];
    final who = accounts.length == 1
        ? accounts.first.orgName
        : 'your landlord or agency';
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return DetailScaffold(
      title: const Text('My profile'),
      header: Row(
        children: [
          InitialsAvatar(user?.initials ?? '', size: 56),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user?.fullName ?? '',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  accounts.length == 1
                      ? 'Tenant at ${accounts.first.orgName}'
                      : 'Tenant with ${accounts.length} landlords',
                  style: const TextStyle(color: Color(0xFFC9D6E5)),
                ),
              ],
            ),
          ),
        ],
      ),
      children: [
        DetailCard(
          title: 'How we reach you',
          children: [
            _InfoRow(
              icon: Icons.phone_iphone,
              label: 'Phone',
              value: user?.phone ?? 'Not set',
            ),
            _InfoRow(
              icon: Icons.alternate_email,
              label: 'Email',
              value: user?.email ?? 'Not set',
            ),
            Text(
              'You sign in with these. To change them, ask $who.',
              style: TextStyle(fontSize: 12.5, color: muted),
            ),
          ],
        ),
        DetailCard(
          title: 'Account',
          gap: 4,
          children: [
            _ActionRow(
              key: const Key('profile-name'),
              icon: Icons.badge_outlined,
              title: 'Name',
              subtitle: user?.fullName ?? '',
              onTap: () => EditNameSheet.show(context),
            ),
            _ActionRow(
              key: const Key('profile-password'),
              icon: Icons.lock_outline,
              title: (user?.hasPassword ?? true)
                  ? 'Change password'
                  : 'Set a password',
              subtitle: (user?.hasPassword ?? true)
                  ? 'Signs you out on other devices'
                  : 'You sign in with codes now. A password is optional.',
              onTap: () => PasswordSheet.show(context),
            ),
          ],
        ),
        if (accounts.isNotEmpty)
          DetailCard(
            title: 'You rent from',
            gap: 12,
            children: [
              for (final a in accounts)
                Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: const Color(0xFFEEF2F7),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(
                        Icons.apartment_outlined,
                        size: 19,
                        color: HodiColors.navy,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            a.orgName,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          // The account name only when it isn't simply you.
                          if (a.name.trim().toLowerCase() !=
                              (user?.fullName ?? '').trim().toLowerCase())
                            Text(
                              'Account: ${a.name}',
                              style: TextStyle(fontSize: 12.5, color: muted),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
            ],
          ),
        Center(
          child: TextButton.icon(
            key: const Key('profile-delete'),
            onPressed: () => DeleteAccountScreen.open(context),
            style: TextButton.styleFrom(foregroundColor: HodiColors.danger),
            icon: const Icon(Icons.person_remove_outlined, size: 18),
            label: const Text('Delete my account'),
          ),
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Row(
      children: [
        Icon(icon, size: 20, color: muted),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(fontSize: 12, color: muted)),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Icon(icon, size: 20, color: muted),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(fontSize: 12.5, color: muted),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: muted),
          ],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.text, this.action});

  final IconData icon;
  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: muted),
            const SizedBox(height: 12),
            Text(
              text,
              textAlign: TextAlign.center,
              style: TextStyle(color: muted),
            ),
            ?action,
          ],
        ),
      ),
    );
  }
}
