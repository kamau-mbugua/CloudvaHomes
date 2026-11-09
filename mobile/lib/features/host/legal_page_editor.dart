import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// Edits one legal page of the booking site (Markdown). Pops the edited text on Done; the
/// Booking site screen's Save sends it. "View page" opens the saved version on the site.
class LegalPageEditor extends StatefulWidget {
  const LegalPageEditor({
    super.key,
    required this.title,
    required this.text,
    required this.starter,
    required this.viewUrl,
    required this.canEdit,
  });
  final String title;
  final String text;
  final String starter;
  final String? viewUrl;
  final bool canEdit;

  @override
  State<LegalPageEditor> createState() => _LegalPageEditorState();
}

class _LegalPageEditorState extends State<LegalPageEditor> {
  late final _text = TextEditingController(text: widget.text);

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isStarter = _text.text.trim() == widget.starter.trim();
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          if (widget.viewUrl != null)
            TextButton(
              onPressed: () => launchUrl(
                Uri.parse(widget.viewUrl!),
                mode: LaunchMode.externalApplication,
              ),
              child: const Text('View page'),
            ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              isStarter
                  ? 'Starter text: plain-English terms with your business details. It is not legal advice — '
                        'read it and change anything that doesn’t fit how you work.'
                  : 'Your text.',
            ),
            const SizedBox(height: 8),
            Expanded(
              child: TextField(
                key: const Key('legal-text'),
                controller: _text,
                enabled: widget.canEdit,
                maxLines: null,
                expands: true,
                maxLength: 20000,
                textAlignVertical: TextAlignVertical.top,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  helperText:
                      '## Heading · **bold** · *italic* · - list · [text](https://…)',
                ),
              ),
            ),
            const SizedBox(height: 12),
            if (widget.canEdit) ...[
              if (!isStarter)
                OutlinedButton(
                  onPressed: () => setState(() => _text.text = widget.starter),
                  child: const Text('Reset to starter text'),
                ),
              const SizedBox(height: 8),
              FilledButton(
                key: const Key('legal-done'),
                onPressed: () => Navigator.of(context).pop(_text.text),
                child: const Text('Done'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
