'use client';

/**
 * Tags eingeben: Marken zum Antippen, ein Feld zum Tippen, Vorschläge darunter.
 *
 * Drei Entscheidungen, alle aus demselben Grund — eine Buchung wird unterwegs
 * erfasst, nicht am Schreibtisch:
 *
 * 1. **Vorschläge zum Antippen.** Wer „Urlaub" schon einmal benutzt hat, soll
 *    ihn nicht erneut tippen — so entstehen „Urlaub" und „urlaub" gar nicht
 *    erst als zwei Marken. Zusätzlich hängt am Feld eine `datalist`, damit die
 *    Tastatur des Geräts selbst vervollständigt.
 * 2. **Komma und Enter legen an**, nicht ein eigener Knopf: Beides liegt auf
 *    jeder Tastatur, und das Trennzeichen ist dasselbe wie in der Domäne.
 * 3. **Ein getippter, aber nicht bestätigter Tag geht nicht verloren.** Wer
 *    „Urlaub" tippt und direkt auf „Fertig" drückt, verlässt das Feld — und
 *    `onBlur` übernimmt ihn, bevor gespeichert wird.
 *
 * Die Regeln, was ein Tag ist, stehen in `lib/domain/tags.ts` und nicht hier.
 */

import { useId, useState } from 'react';
import { TAG_LIMITS, addTag, parseTags, removeTag, tagKey } from '../../lib/domain/tags';
import { inputClass } from '../../lib/ui/Field';

export interface TagInputProps {
  tags: readonly string[];
  onChange: (tags: string[]) => void;
  /** Bisher benutzte Tags, häufigste zuerst. */
  suggestions: readonly string[];
  label?: string;
  hint?: string;
  /** Wie viele Vorschläge höchstens angeboten werden. */
  maxSuggestions?: number;
}

export function TagInput({
  tags,
  onChange,
  suggestions,
  label = 'Tags',
  hint = 'Optional — mit Komma trennen. Für Auswertungen quer zu den Töpfen.',
  maxSuggestions = 6,
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const listId = useId();

  const voll = tags.length >= TAG_LIMITS.perEntry;

  function uebernehmen(raw: string) {
    let next = [...tags];
    for (const tag of parseTags(raw)) next = addTag(next, tag);
    onChange(next);
    setDraft('');
  }

  const offeneVorschlaege = suggestions
    .filter((tag) => !tags.some((vorhanden) => tagKey(vorhanden) === tagKey(tag)))
    .slice(0, maxSuggestions);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink-muted">
        {label}
      </label>

      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tagKey(tag)}>
              <button
                type="button"
                onClick={() => onChange(removeTag(tags, tag))}
                className="flex items-center gap-1 rounded-full border border-line bg-accent-subtle px-2.5 py-1 text-xs"
                aria-label={`Tag ${tag} entfernen`}
              >
                <span>{tag}</span>
                <span aria-hidden className="text-ink-muted">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        id={inputId}
        list={listId}
        className={`${inputClass} disabled:opacity-50`}
        value={draft}
        disabled={voll}
        placeholder={voll ? `Mehr als ${TAG_LIMITS.perEntry} gehen nicht` : 'z. B. Urlaub'}
        maxLength={TAG_LIMITS.length * 2}
        autoComplete="off"
        onChange={(event) => {
          const wert = event.target.value;
          // Ein getipptes Komma legt den Tag an, statt im Feld zu bleiben.
          if (/[,;]/.test(wert)) uebernehmen(wert);
          else setDraft(wert);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            // Sonst schickt Enter das umgebende Formular ab.
            event.preventDefault();
            uebernehmen(draft);
          }
          if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (draft.trim() !== '') uebernehmen(draft);
        }}
      />
      <datalist id={listId}>
        {suggestions.map((tag) => (
          <option key={tagKey(tag)} value={tag} />
        ))}
      </datalist>

      {offeneVorschlaege.length > 0 && !voll && (
        <ul className="flex flex-wrap gap-1.5">
          {offeneVorschlaege.map((tag) => (
            <li key={tagKey(tag)}>
              <button
                type="button"
                onClick={() => onChange(addTag(tags, tag))}
                className="rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-ink-muted"
              >
                + {tag}
              </button>
            </li>
          ))}
        </ul>
      )}

      {hint !== '' && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
