import { useId, useRef, useState, type FormEvent } from 'react';
import type { Roster, Volunteer } from '../domain/types';
import './VolunteerEditor.css';

export interface VolunteerEditorProps {
  roster: Roster;
  onUpdate: (volunteerId: string, patch: Partial<Volunteer>) => void;
}

interface DraftRange { start: string; end: string }

function displayTime(minutes: number): string {
  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
}

function parseTime(value: string, allowMidnightEnd = false): number | null {
  if (allowMidnightEnd && value === '24:00') return 1440;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function VolunteerForm({ volunteer, capabilities, onUpdate }: {
  volunteer: Volunteer;
  capabilities: string[];
  onUpdate: VolunteerEditorProps['onUpdate'];
}) {
  const id = useId();
  const [selected, setSelected] = useState(volunteer.capabilities);
  const [ranges, setRanges] = useState<DraftRange[]>(volunteer.availability.map((range) => ({
    start: displayTime(range.start), end: displayTime(range.end),
  })));
  const [preferred, setPreferred] = useState(String(volunteer.preferredMinutes));
  const [errors, setErrors] = useState<string[]>([]);
  const errorRef = useRef<HTMLDivElement>(null);
  const original = JSON.stringify({ capabilities: volunteer.capabilities.slice().sort(), availability: volunteer.availability, preferredMinutes: volunteer.preferredMinutes });
  const draftAvailability = ranges.map((range) => ({ start: parseTime(range.start), end: parseTime(range.end, true) }));
  const draft = JSON.stringify({ capabilities: selected.slice().sort(), availability: draftAvailability, preferredMinutes: Number(preferred) });
  const dirty = original !== draft;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: string[] = [];
    if (selected.length > 12) nextErrors.push('Select at most 12 capabilities for one volunteer. Remove a capability before saving.');
    const availability: Volunteer['availability'] = [];
    ranges.forEach((range, index) => {
      const start = parseTime(range.start);
      const end = parseTime(range.end, true);
      if (start === null || end === null) nextErrors.push(`Window ${index + 1}: use a 24-hour time such as 09:30. End may be 24:00.`);
      else if (start >= end) nextErrors.push(`Window ${index + 1}: the end must be later than the start on this event date.`);
      else availability.push({ start, end });
    });
    const preferredMinutes = Number(preferred);
    if (preferred.trim() === '' || !Number.isInteger(preferredMinutes) || preferredMinutes < 0 || preferredMinutes > 1440) {
      nextErrors.push('Preferred workload must be a whole number from 0 to 1,440 minutes.');
    }
    setErrors(nextErrors);
    if (nextErrors.length) {
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    onUpdate(volunteer.id, { capabilities: selected, availability, preferredMinutes });
    requestAnimationFrame(() => document.getElementById(`volunteer-summary-${volunteer.id}`)?.focus());
  }

  return <form className="ve-form" onSubmit={submit} noValidate aria-label={`Edit ${volunteer.name} constraints`}>
    <fieldset className="ve-fieldset">
      <legend>Capabilities <span className="ve-kind">Hard constraint</span></legend>
      <p className="ve-help">Only capabilities explicitly checked here can satisfy a shift requirement.</p>
      <div className="ve-capabilities">
        {capabilities.map((capability) => <label className="ve-check" key={capability}>
          <input type="checkbox" checked={selected.includes(capability)} onChange={(event) => {
            setSelected(event.target.checked ? [...selected, capability] : selected.filter((item) => item !== capability));
          }} />
          <span>{capability}</span>
        </label>)}
      </div>
    </fieldset>

    <fieldset className="ve-fieldset">
      <legend>Availability <span className="ve-kind">Hard constraint</span></legend>
      <p className="ve-help" id={`${id}-time-help`}>On the event date, in 24-hour time. Available windows must cover the full shift. Cancellation absences still apply.</p>
      {ranges.length === 0 && <p className="ve-empty">No available times. Add a window to make this volunteer eligible.</p>}
      <div className="ve-windows">
        {ranges.map((range, index) => <div className="ve-window" key={index}>
          <span className="ve-window-label">Window {index + 1}</span>
          <label>From
            <input type="text" inputMode="text" maxLength={5} placeholder="09:00" value={range.start}
              aria-describedby={`${id}-time-help`} aria-label={`${volunteer.name} window ${index + 1} start`}
              onChange={(event) => setRanges(ranges.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item))} />
          </label>
          <label>Until
            <input type="text" inputMode="text" maxLength={5} placeholder="12:00" value={range.end}
              aria-describedby={`${id}-time-help`} aria-label={`${volunteer.name} window ${index + 1} end`}
              onChange={(event) => setRanges(ranges.map((item, itemIndex) => itemIndex === index ? { ...item, end: event.target.value } : item))} />
          </label>
          <button className="ve-remove" type="button" aria-label={`Remove ${volunteer.name} availability window ${index + 1}`}
            onClick={() => setRanges(ranges.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
        </div>)}
      </div>
      <button className="ve-add" type="button" disabled={ranges.length >= 6}
        onClick={() => setRanges([...ranges, { start: '09:00', end: '12:00' }])}>Add availability window</button>
      {ranges.length >= 6 && <p className="ve-help">This local editor supports up to six windows per volunteer.</p>}
    </fieldset>

    <div className="ve-preference">
      <label htmlFor={`${id}-preferred`}>Preferred workload <span className="ve-kind ve-kind-soft">Soft preference</span></label>
      <p className="ve-help" id={`${id}-preferred-help`}>Minutes for this event. Going over is allowed; the comparison shows the tradeoff.</p>
      <div className="ve-preferred-input"><input id={`${id}-preferred`} type="number" min="0" max="1440" step="1"
        value={preferred} onChange={(event) => setPreferred(event.target.value)} aria-describedby={`${id}-preferred-help`} /><span>minutes</span></div>
    </div>

    {errors.length > 0 && <div className="ve-errors" role="alert" tabIndex={-1} ref={errorRef}><p>Check these inputs before saving:</p><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
    <div className="ve-actions"><span>{dirty ? 'Unsaved changes' : 'Matches current roster'}</span><button type="submit" className="ve-save" disabled={!dirty}>Save constraints</button></div>
  </form>;
}

export function VolunteerEditor({ roster, onUpdate }: VolunteerEditorProps) {
  const capabilities = [...new Set([...roster.volunteers.flatMap((volunteer) => volunteer.capabilities), ...roster.shifts.flatMap((shift) => shift.requires)])].sort();
  return <div className="ve-list">
    {roster.volunteers.map((volunteer) => <details className="ve-volunteer" key={volunteer.id}>
      <summary id={`volunteer-summary-${volunteer.id}`}><span className="ve-name">{volunteer.name}</span><span className="ve-summary">{volunteer.capabilities.length} {volunteer.capabilities.length === 1 ? 'capability' : 'capabilities'} <span aria-hidden="true">/</span> {volunteer.preferredMinutes} min preferred</span><svg className="ve-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></summary>
      <VolunteerForm key={JSON.stringify(volunteer)} volunteer={volunteer} capabilities={capabilities} onUpdate={onUpdate} />
    </details>)}
  </div>;
}
