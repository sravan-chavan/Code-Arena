'use client';
import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { oneDark } from '@codemirror/theme-one-dark';

export default function Editor({ value, onChange, language = 'python' }) {
  const editor = useRef();
  const viewRef = useRef(null);
  const isUpdatingRef = useRef(false);

  useEffect(() => {
    if (!editor.current) return;

    let langExtension = python();
    if (language === 'javascript') langExtension = javascript();
    if (language === 'cpp') langExtension = cpp();
    if (language === 'java') langExtension = java();

    const startState = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        oneDark,
        langExtension,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isUpdatingRef.current) {
            onChange(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: editor.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, []);

  useEffect(() => {
    if (viewRef.current) {
      const currentValue = viewRef.current.state.doc.toString();
      if (value !== currentValue) {
        isUpdatingRef.current = true;
        viewRef.current.dispatch({
          changes: { from: 0, to: currentValue.length, insert: value }
        });
        isUpdatingRef.current = false;
      }
    }
  }, [value]);

  return <div ref={editor} style={{ height: '100%', overflow: 'hidden' }} />;
}
