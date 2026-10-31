import 'package:flutter/material.dart';

import '../api/api_error.dart';
import 'common.dart';

/// One page of rows and whether more follow.
typedef PageResult<T> = ({List<T> rows, bool hasMore});

/// An infinite list over a paged endpoint: loads page 1, then the next page near the end,
/// with pull-to-refresh. Change [resetKey] (e.g. a filter) to start over.
class PagedList<T> extends StatefulWidget {
  const PagedList({
    super.key,
    required this.load,
    required this.itemBuilder,
    this.empty,
    this.header,
    this.resetKey,
    this.padding = const EdgeInsets.only(bottom: 24),
  });

  final Future<PageResult<T>> Function(int page) load;
  final Widget Function(BuildContext context, T item) itemBuilder;
  final Widget? empty;
  final Widget? header;
  final Object? resetKey;
  final EdgeInsets padding;

  @override
  State<PagedList<T>> createState() => PagedListState<T>();
}

class PagedListState<T> extends State<PagedList<T>> {
  final _rows = <T>[];
  int _page = 0;
  bool _hasMore = true;
  bool _loading = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _next();
  }

  @override
  void didUpdateWidget(covariant PagedList<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.resetKey != widget.resetKey) refresh();
  }

  /// Starts again from page 1 (after a change elsewhere, or pull-to-refresh).
  Future<void> refresh() async {
    setState(() {
      _rows.clear();
      _page = 0;
      _hasMore = true;
      _error = null;
    });
    await _next();
  }

  Future<void> _next() async {
    if (_loading || !_hasMore) return;
    setState(() => _loading = true);
    final key = widget.resetKey;
    try {
      final res = await widget.load(_page + 1);
      if (!mounted || key != widget.resetKey) return;
      setState(() {
        _rows.addAll(res.rows);
        _page++;
        _hasMore = res.hasMore;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final header = widget.header;
    final extra = header == null ? 0 : 1;
    if (_rows.isEmpty && _error != null) {
      return RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          children: [
            ?header,
            ErrorState(message: messageOf(_error!), onRetry: refresh),
          ],
        ),
      );
    }
    if (_rows.isEmpty && !_loading && !_hasMore) {
      return RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          children: [
            ?header,
            widget.empty ?? const EmptyState(title: 'Nothing here yet'),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView.builder(
        padding: widget.padding,
        itemCount: extra + _rows.length + (_hasMore || _error != null ? 1 : 0),
        itemBuilder: (context, i) {
          if (header != null && i == 0) return header;
          final index = i - extra;
          if (index < _rows.length) {
            return widget.itemBuilder(context, _rows[index]);
          }
          if (_error != null) {
            return TextButton(
              onPressed: _next,
              child: const Text('Couldn’t load more. Try again'),
            );
          }
          WidgetsBinding.instance.addPostFrameCallback((_) => _next());
          if (_rows.isEmpty) {
            return const KodiHubSkeletonList(rows: 5);
          }
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: KodiHubSpinner(size: 24)),
          );
        },
      ),
    );
  }
}
