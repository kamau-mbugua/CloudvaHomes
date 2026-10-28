import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_error.dart';
import '../../../core/dates.dart';
import '../../../core/money.dart';
import '../../../core/widgets/common.dart';
import '../../../core/widgets/paged_list.dart';
import '../staff_api.dart';
import '../staff_models.dart';
import '../staff_widgets.dart';
import 'photo.dart';

class ExpensesScreen extends ConsumerStatefulWidget {
  const ExpensesScreen({super.key});
  @override
  ConsumerState<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends ConsumerState<ExpensesScreen> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(staffApiProvider);
    final version = ref.watch(listsVersionProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Expenses')),
      floatingActionButton: can(ref, 'expenses:create')
          ? FloatingActionButton.extended(
              icon: const Icon(Icons.add),
              label: const Text('Add expense'),
              onPressed: () => context.push('/staff/more/expenses/new'),
            )
          : null,
      body: !can(ref, 'expenses:view')
          ? const NoPermission('expenses')
          : Column(
              children: [
                SearchField(
                  hint: 'Name, payee or reference',
                  onChanged: (v) => setState(() => _q = v),
                ),
                Expanded(
                  child: PagedList<Expense>(
                    resetKey: (_q, version),
                    padding: const EdgeInsets.only(bottom: 88),
                    load: (page) async {
                      final p = await api.expenses(page: page, q: _q);
                      return (rows: p.rows, hasMore: p.hasMore);
                    },
                    empty: const EmptyState(
                      icon: Icons.receipt_outlined,
                      title: 'No expenses yet',
                    ),
                    itemBuilder: (context, e) => ListTile(
                      title: Text('${e.name} · ${formatKes(e.amount)}'),
                      subtitle: Text(
                        '${formatDay(e.incurredOn)} · ${expenseCategoryLabel[e.category] ?? e.category} · ${e.propertyName}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: e.voided
                          ? const StatusChip('Void')
                          : e.hasReceipt
                          ? const Icon(
                              Icons.attach_file,
                              semanticLabel: 'Has a receipt',
                            )
                          : null,
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

/// Add an expense (`POST /expenses`), with an optional receipt photo uploaded first.
class ExpenseFormScreen extends ConsumerStatefulWidget {
  const ExpenseFormScreen({super.key});
  @override
  ConsumerState<ExpenseFormScreen> createState() => _ExpenseFormScreenState();
}

class _ExpenseFormScreenState extends ConsumerState<ExpenseFormScreen> {
  final _name = TextEditingController();
  final _payee = TextEditingController();
  final _reference = TextEditingController();
  final _amount = TextEditingController();
  String? _propertyId;
  String? _category;
  late DateTime _incurredOn = nairobiToday();
  Uint8List? _photo;
  String? _uploadId;
  Map<String, String> _errors = {};
  String? _general;
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _payee.dispose();
    _reference.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _save(List<PropertyOption> properties) async {
    final propertyId =
        _propertyId ?? (properties.length == 1 ? properties.first.id : null);
    final cents = parseKes(_amount.text);
    final found = <String, String>{
      if (propertyId == null) 'propertyId': 'Choose the property.',
      if (_category == null) 'category': 'Choose a category.',
      if (_name.text.trim().isEmpty) 'name': 'Say what it was for.',
      if (cents == null) 'amount': 'Enter the amount in KES, e.g. 2,500.',
      if (cents != null && cents <= 0) 'amount': 'Enter an amount above zero.',
      if (_incurredOn.isAfter(nairobiToday()))
        'incurredOn': 'The date can’t be in the future.',
    };
    setState(() {
      _errors = found;
      _general = null;
    });
    if (found.isNotEmpty) return;
    setState(() => _saving = true);
    final api = ref.read(staffApiProvider);
    try {
      if (_photo != null && _uploadId == null) {
        try {
          _uploadId = await api.upload('EXPENSE_RECEIPT', _photo!);
        } on ApiError catch (e) {
          if (mounted) {
            setState(() => _errors = {'receiptUploadId': staffErrorMessage(e)});
          }
          return;
        }
      }
      await api.createExpense({
        'propertyId': propertyId,
        'category': _category,
        'name': _name.text.trim(),
        if (_payee.text.trim().isNotEmpty) 'payee': _payee.text.trim(),
        if (_reference.text.trim().isNotEmpty)
          'reference': _reference.text.trim(),
        'amount': cents,
        'incurredOn': toDay(_incurredOn),
        'receiptUploadId': ?_uploadId,
      });
      if (!mounted) return;
      ref.read(listsVersionProvider.notifier).state++;
      ref.invalidate(dashboardProvider);
      showMessage(context, 'Expense saved.');
      context.pop();
    } on ApiError catch (e) {
      if (!mounted) return;
      final f = e.fieldErrors;
      if (f.containsKey('receiptUploadId')) _uploadId = null;
      setState(() {
        _errors = {
          for (final k in [
            'propertyId',
            'category',
            'name',
            'payee',
            'reference',
            'amount',
            'incurredOn',
          ])
            if (f[k] != null) k: f[k]!,
          if (f['receiptUploadId'] != null)
            'receiptUploadId': staffErrorMessage(e),
        };
        _general = _errors.isEmpty ? staffErrorMessage(e) : null;
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final properties = ref.watch(propertiesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Add expense')),
      body: !can(ref, 'expenses:create')
          ? const NoPermission('adding expenses')
          : AsyncBody(
              value: properties,
              onRetry: () => ref.invalidate(propertiesProvider),
              data: (list) => ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  DropdownButtonFormField<String>(
                    initialValue:
                        _propertyId ??
                        (list.length == 1 ? list.first.id : null),
                    isExpanded: true,
                    decoration: InputDecoration(
                      labelText: 'Property',
                      errorText: _errors['propertyId'],
                    ),
                    items: [
                      for (final p in list)
                        DropdownMenuItem(value: p.id, child: Text(p.name)),
                    ],
                    onChanged: (v) => setState(() => _propertyId = v),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _category,
                    isExpanded: true,
                    decoration: InputDecoration(
                      labelText: 'Category',
                      errorText: _errors['category'],
                    ),
                    items: [
                      for (final e in expenseCategoryLabel.entries)
                        DropdownMenuItem(value: e.key, child: Text(e.value)),
                    ],
                    onChanged: (v) => setState(() => _category = v),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _name,
                    maxLength: 120,
                    decoration: InputDecoration(
                      labelText: 'What for',
                      hintText: 'e.g. Plumbing repair, block A',
                      errorText: _errors['name'],
                      counterText: '',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _amount,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: InputDecoration(
                      labelText: 'Amount (KES)',
                      errorText: _errors['amount'],
                    ),
                  ),
                  const SizedBox(height: 12),
                  InkWell(
                    onTap: () async {
                      final d = await showDatePicker(
                        context: context,
                        initialDate: _incurredOn,
                        firstDate: DateTime(2000),
                        lastDate: nairobiToday(),
                        helpText: 'Date',
                      );
                      if (d != null) setState(() => _incurredOn = d);
                    },
                    child: InputDecorator(
                      decoration: InputDecoration(
                        labelText: 'Date',
                        errorText: _errors['incurredOn'],
                        suffixIcon: const Icon(Icons.calendar_today_outlined),
                      ),
                      child: Text(formatDay(toDay(_incurredOn))),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _payee,
                    maxLength: 120,
                    decoration: InputDecoration(
                      labelText: 'Paid to (optional)',
                      errorText: _errors['payee'],
                      counterText: '',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _reference,
                    maxLength: 60,
                    decoration: InputDecoration(
                      labelText: 'Supplier’s invoice or receipt no. (optional)',
                      errorText: _errors['reference'],
                      counterText: '',
                    ),
                  ),
                  const SizedBox(height: 12),
                  PhotoField(
                    label: 'Add a receipt photo',
                    photo: _photo,
                    error: _errors['receiptUploadId'],
                    onPick: () async {
                      final p = await pickPhoto(context);
                      if (p != null) {
                        setState(() {
                          _photo = p;
                          _uploadId = null;
                        });
                      }
                    },
                    onRemove: () => setState(() {
                      _photo = null;
                      _uploadId = null;
                    }),
                  ),
                  if (_general != null) ...[
                    const SizedBox(height: 12),
                    ErrorBox(_general!),
                  ],
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _saving ? null : () => _save(list),
                    child: Text(_saving ? 'Saving…' : 'Save expense'),
                  ),
                ],
              ),
            ),
    );
  }
}
