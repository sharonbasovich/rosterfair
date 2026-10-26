import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { Roster, Violation } from '../domain/types';
import { exportRosterFile, MAX_ROSTER_FILE_BYTES, parseRosterFile } from '../domain/rosterFile';
import './RosterFiles.css';

export interface RosterFilesProps {
  roster: Roster;
  onImport: (source: string) => boolean;
  onNotice: (message: string) => void;
}

interface StagedRoster {
  source: string;
  fileName: string;
  roster: Roster;
  warnings: Violation[];
  byteLength: number;
}

interface FileError { message: string; issues: { path: string; message: string }[] }

export function RosterFiles({ roster, onImport, onNotice }: RosterFilesProps) {
  const id = useId();
  const [reading, setReading] = useState(false);
  const [staged, setStaged] = useState<StagedRoster | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<FileError | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const importErrorRef = useRef<HTMLParagraphElement>(null);
  const alive = useRef(true);
  const readToken = useRef(0);
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    alive.current = true;
    const pendingDownloads = downloads.current;
    return () => {
      alive.current = false;
      readToken.current += 1;
      pendingDownloads.forEach((timer, url) => {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      });
      pendingDownloads.clear();
    };
  }, []);

  useEffect(() => {
    if (!staged || !dialogRef.current) return;
    if (!dialogRef.current.open) dialogRef.current.showModal();
    cancelRef.current?.focus();
  }, [staged]);

  function returnToPicker() {
    requestAnimationFrame(() => { if (alive.current) pickerRef.current?.focus(); });
  }

  function closePreview() {
    dialogRef.current?.close();
    setStaged(null);
    setAcknowledged(false);
    setImportError(null);
    returnToPicker();
  }

  function dismissPreview() {
    closePreview();
    onNotice('Import canceled. The current roster has not changed.');
  }

  function rejectFile(message: string, issues: FileError['issues'] = []) {
    setError({ message, issues });
    onNotice('File not imported. Check the file message; the current roster has not changed.');
  }

  function cancelRead() {
    readToken.current += 1;
    setReading(false);
    onNotice('File read canceled. The current roster has not changed.');
    returnToPicker();
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const token = ++readToken.current;
    setError(null);
    setExportNote(null);
    setImportError(null);
    setAcknowledged(false);
    setReading(false);
    if (!/\.json$/i.test(file.name)) {
      rejectFile('Choose a .json roster file.');
      return;
    }
    if (file.size > MAX_ROSTER_FILE_BYTES) {
      rejectFile('This file is too large. Roster files must be 128 KiB or smaller.');
      return;
    }
    setReading(true);
    onNotice('Reading a local roster file. The current roster has not changed.');
    try {
      const buffer = await file.arrayBuffer();
      if (!alive.current || readToken.current !== token) return;
      if (buffer.byteLength > MAX_ROSTER_FILE_BYTES) {
        rejectFile('This file is too large. Roster files must be 128 KiB or smaller.');
        return;
      }
      let source: string;
      try {
        source = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      } catch {
        rejectFile('This file is not valid UTF-8 text. Choose a UTF-8 JSON export from RosterFair.');
        return;
      }
      const parsed = parseRosterFile(source);
      if (!parsed.ok) {
        rejectFile(parsed.error, parsed.issues);
        return;
      }
      setStaged({ source, fileName: file.name, roster: parsed.roster, warnings: parsed.warnings, byteLength: parsed.byteLength });
      onNotice('File checked. Review the preview before replacing the current roster.');
    } catch {
      if (alive.current && readToken.current === token) {
        rejectFile('The browser could not read this file. Choose it again or select another JSON export.');
      }
    } finally {
      if (alive.current && readToken.current === token) setReading(false);
    }
  }

  function exportCurrent() {
    setError(null);
    setExportNote(null);
    const exported = exportRosterFile(roster);
    if (!exported.ok) {
      setError({ message: exported.error, issues: exported.issues });
      return;
    }
    let url: string | null = null;
    try {
      url = URL.createObjectURL(new Blob([exported.text], { type: 'application/json;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exported.fileName;
      anchor.hidden = true;
      document.body.append(anchor);
      try { anchor.click(); } finally { anchor.remove(); }
      const downloadUrl = url;
      const timer = setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
        downloads.current.delete(downloadUrl);
      }, 1000);
      downloads.current.set(downloadUrl, timer);
      setExportNote(exported.warnings.length
        ? `Draft export prepared with ${exported.warnings.length} unresolved hard-constraint ${exported.warnings.length === 1 ? 'issue' : 'issues'}. These constraints are preserved in the file.`
        : 'Export prepared. Repair previews and undo history are not included.');
      onNotice('Roster JSON export prepared. Your browser handles the download.');
    } catch {
      if (url) URL.revokeObjectURL(url);
      setError({ message: 'The browser could not start this download. The current roster has not changed. Try exporting again.', issues: [] });
    }
  }

  function confirmImport() {
    if (!staged || (staged.warnings.length > 0 && !acknowledged)) return;
    try {
      if (onImport(staged.source)) closePreview();
      else {
        setImportError('The roster was not imported. Cancel this preview to inspect the current roster, or try importing again.');
        requestAnimationFrame(() => importErrorRef.current?.focus());
      }
    } catch {
      setImportError('The roster could not be imported. Cancel this preview to keep working, or try again.');
      requestAnimationFrame(() => importErrorRef.current?.focus());
    }
  }

  function containTabFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')]
      .filter(element => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  }

  return <section className="rf-files" aria-labelledby={`${id}-heading`}>
    <div className="rf-files-heading"><div><h2 id={`${id}-heading`}>Keep a local roster copy</h2><p>Export saved assignments, pins, volunteer inputs and absences. Save any open forms first; unsaved form inputs are not included.</p></div><span className="rf-format">RosterFair JSON · version 1</span></div>
    <p className="rf-privacy">Files stay on your device; this app does not upload them. Exports include names, availability and capabilities. Share them carefully.</p>
    <div className="rf-file-actions">
      <button type="button" className="secondary rf-export" onClick={exportCurrent}>Export roster JSON</button>
      <label className={`rf-picker ${reading ? 'rf-picker-disabled' : ''}`}>
        Choose JSON file
        <input ref={pickerRef} type="file" accept=".json,application/json" aria-label="Choose roster JSON file" disabled={reading} onChange={(event) => { void chooseFile(event); }} aria-describedby={`${id}-file-help`} />
      </label>
      {reading && <button type="button" className="secondary rf-cancel-read" onClick={cancelRead}>Cancel file read</button>}
    </div>
    <p className="rf-file-help" id={`${id}-file-help`}>One .json file, up to 128 KiB. A preview opens before any replacement. Undo can restore the saved roster from before an import.</p>
    {reading && <p className="rf-reading" role="status">Reading file. You can cancel this read.</p>}
    {error && <div className="rf-file-error" role="alert"><strong>{error.message}</strong>{error.issues.length > 0 && <ul>{error.issues.map((issue, index) => <li key={index}><span className="rf-issue-path">{issue.path}</span>: {issue.message}</li>)}</ul>}<p>The current roster has not changed.</p></div>}
    {exportNote && <p className="rf-export-note" role="status">{exportNote}</p>}

    <dialog className="rf-dialog" ref={dialogRef} aria-labelledby={`${id}-preview-heading`} aria-describedby={`${id}-preview-description`} onKeyDown={containTabFocus} onCancel={(event) => { event.preventDefault(); dismissPreview(); }}>
      {staged && <div className="rf-dialog-content">
        <h2 id={`${id}-preview-heading`}>Replace the current roster?</h2>
        <div className="rf-dialog-scroll" role="region" aria-label="Roster file preview details" tabIndex={0}>
        <p id={`${id}-preview-description`} className="rf-dialog-intro">Importing replaces the current roster and unsaved form inputs, and clears repair previews. Undo restores the previous saved local roster.</p>
        <dl className="rf-preview">
          <div><dt>Event</dt><dd>{staged.roster.title}</dd></div>
          <div><dt>Event date</dt><dd>{staged.roster.date}</dd></div>
          <div><dt>Roster</dt><dd>{staged.roster.volunteers.length} {staged.roster.volunteers.length === 1 ? 'volunteer' : 'volunteers'}, {staged.roster.shifts.length} {staged.roster.shifts.length === 1 ? 'shift' : 'shifts'}</dd></div>
          <div><dt>Fixed assignments</dt><dd>{staged.roster.shifts.filter((shift) => shift.pinned).length} pinned</dd></div>
          <div><dt>Recorded absences</dt><dd>{staged.roster.absences.length}</dd></div>
          <div><dt>File</dt><dd>{staged.fileName} <span className="rf-file-size">({staged.byteLength.toLocaleString()} bytes)</span></dd></div>
        </dl>
        {staged.warnings.length > 0 && <div className="rf-import-warnings"><h3>Unresolved hard constraints</h3><p>This is a draft with assignment conflicts. Import preserves the inputs and pins; it does not relax hard constraints.</p><ul>{staged.warnings.map((warning, index) => <li key={index}>{warning.message}</li>)}</ul><label className="rf-acknowledge"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>Import this draft with unresolved hard constraints</span></label></div>}
        <p className="rf-dialog-privacy">This file may contain names and volunteer availability. Review its source before importing.</p>
        {importError && <p className="rf-import-error" role="alert" ref={importErrorRef} tabIndex={-1}>{importError}</p>}
        </div>
        <div className="rf-dialog-actions"><button type="button" ref={cancelRef} autoFocus className="secondary" onClick={dismissPreview}>Cancel</button><button type="button" className="primary" disabled={staged.warnings.length > 0 && !acknowledged} onClick={confirmImport}>Import roster</button></div>
      </div>}
    </dialog>
  </section>;
}
