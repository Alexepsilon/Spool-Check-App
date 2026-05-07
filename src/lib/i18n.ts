// Minimal i18n: two dictionaries (EN, NL) and a hook.
//
// Heavier libraries (i18next, react-intl) are overkill for two languages
// and a few dozen strings. The dictionary is plain TypeScript so missing
// keys fail at compile time, and there's no runtime cost beyond a Map
// lookup per render.

import { useEffect, useState } from 'react';
import { loadSettings, saveSetting } from './db';

export type Lang = 'en' | 'nl';

const en = {
  app_title: 'Spool Check',
  // Nav
  nav_home: 'Home',
  nav_lists: 'Lists',
  nav_scan: 'Scan',
  nav_uncharted: 'Uncharted',
  nav_settings: 'Settings',
  // Generic
  cancel: 'Cancel',
  save: 'Save',
  delete: 'Delete',
  rename: 'Rename',
  close: 'Close',
  ok: 'OK',
  yes: 'Yes',
  no: 'No',
  remove: 'Remove',
  add: 'Add',
  edit: 'Edit',
  back: 'Back',
  // Home
  home_empty_title: 'No deliveries yet',
  home_empty_subtitle:
    'Import a transport list (Excel, CSV, or photo) to start scanning.',
  home_new: 'New delivery',
  home_open: 'Open existing',
  // Import
  import_title: 'Import master list',
  import_pick_file: 'Pick a file (.xlsx or .csv)',
  import_pick_photo: 'Photo of paper list',
  import_pick_camera: 'Take a photo',
  import_pick_gallery: 'Choose from gallery',
  import_running_ocr: 'Running OCR...',
  import_reading_excel: 'Reading file...',
  import_no_codes: 'No codes recognized.',
  import_failed: 'Import failed',
  // Column mapping
  map_title: 'Column mapping',
  map_subtitle:
    'Confirm which column in your file corresponds to each standard field.',
  map_field_drawing: 'Drawing no.',
  map_field_spool: 'Spool',
  map_field_iso: 'Iso number',
  map_field_project: 'Project',
  map_field_diameter: 'Diameter',
  map_field_paint: 'Paint spec.',
  map_field_ral: 'RAL',
  map_field_chclean: 'Ch.clean.',
  map_field_remark: 'Remark',
  map_save_for: 'Save mapping for client',
  map_apply: 'Apply',
  map_unset: '(not in file)',
  // Status board
  board_total: 'Total',
  board_verified: 'Verified',
  board_missing: 'Missing',
  board_complete: '% Complete',
  board_search: 'Search drawing or spool...',
  board_filter_all: 'All',
  board_filter_remaining: 'Remaining',
  board_filter_verified: 'Verified',
  board_filter_missing: 'Missing',
  board_open_scanner: 'Scan',
  board_status_change: 'Change status',
  board_mark_verified: 'Mark verified',
  board_mark_missing: 'Mark missing',
  board_mark_damaged: 'Mark damaged',
  board_mark_expected: 'Reset to expected',
  // Scanner
  scan_aim: 'Frame both Tek nr and Spool inside the box',
  scan_holding: 'Hold steady...',
  scan_no_active: 'No active delivery selected.',
  scan_camera_failed: 'Camera initialisation failed',
  scan_match_found: 'Match found',
  scan_confirm: 'Confirm',
  scan_wrong_match: 'Wrong match',
  scan_not_found: 'Not on the list',
  scan_add_uncharted: 'Add to Uncharted',
  scan_try_again: 'Try again',
  scan_partial_title: 'Which spool?',
  scan_partial_help: "OCR didn't read the spool letter clearly.",
  scan_fuzzy_title: 'Confirm scan',
  scan_fuzzy_help: 'OCR result was uncertain. Did you mean:',
  // Uncharted
  uncharted_title: 'Uncharted items',
  uncharted_empty: 'No uncharted scans yet.',
  uncharted_subtitle:
    'Scans that didn’t match any active master list. Tap to set a disposition.',
  disp_unassigned: 'Unassigned',
  disp_wrong_project: 'Wrong project',
  disp_other_system: 'Other system',
  disp_advance: 'Advance delivery',
  disp_investigate: 'Investigate',
  disp_resolved: 'Resolved',
  // Settings
  settings_title: 'Settings',
  settings_language: 'Language',
  settings_haptic: 'Haptic feedback',
  settings_sound: 'Sound feedback',
  settings_confirm_verified: 'Confirm before marking verified',
  settings_confirm_uncharted: 'Confirm before adding to Uncharted',
  settings_auto_confirm: 'Auto-confirm mode (no dialogs)',
  settings_threshold: 'Match confidence threshold',
  settings_backup: 'Backup & restore',
  settings_export_json: 'Export backup (.json)',
  settings_import_json: 'Restore from backup',
  settings_about: 'About',
} as const;

const nl: Record<keyof typeof en, string> = {
  app_title: 'Spool Check',
  nav_home: 'Start',
  nav_lists: 'Lijsten',
  nav_scan: 'Scannen',
  nav_uncharted: 'Onbekend',
  nav_settings: 'Instellingen',
  cancel: 'Annuleer',
  save: 'Opslaan',
  delete: 'Verwijderen',
  rename: 'Hernoemen',
  close: 'Sluiten',
  ok: 'OK',
  yes: 'Ja',
  no: 'Nee',
  remove: 'Verwijderen',
  add: 'Toevoegen',
  edit: 'Bewerken',
  back: 'Terug',
  home_empty_title: 'Nog geen leveringen',
  home_empty_subtitle:
    'Importeer een transportlijst (Excel, CSV of foto) om te beginnen.',
  home_new: 'Nieuwe levering',
  home_open: 'Open bestaande',
  import_title: 'Lijst importeren',
  import_pick_file: 'Kies een bestand (.xlsx of .csv)',
  import_pick_photo: 'Foto van papieren lijst',
  import_pick_camera: 'Foto maken',
  import_pick_gallery: 'Kies uit galerij',
  import_running_ocr: 'OCR uitvoeren...',
  import_reading_excel: 'Bestand inlezen...',
  import_no_codes: 'Geen codes herkend.',
  import_failed: 'Importeren mislukt',
  map_title: 'Kolommen koppelen',
  map_subtitle:
    'Bevestig welke kolom in uw bestand bij welk veld hoort.',
  map_field_drawing: 'Tek nr.',
  map_field_spool: 'Spool',
  map_field_iso: 'Iso nummer',
  map_field_project: 'Project',
  map_field_diameter: 'Diameter',
  map_field_paint: 'Verfsysteem',
  map_field_ral: 'RAL',
  map_field_chclean: 'Ch.clean.',
  map_field_remark: 'Opmerking',
  map_save_for: 'Mapping opslaan voor klant',
  map_apply: 'Toepassen',
  map_unset: '(niet in bestand)',
  board_total: 'Totaal',
  board_verified: 'Geverifieerd',
  board_missing: 'Mist',
  board_complete: '% Klaar',
  board_search: 'Zoek op tekening of spool...',
  board_filter_all: 'Alle',
  board_filter_remaining: 'Resterend',
  board_filter_verified: 'Geverifieerd',
  board_filter_missing: 'Mist',
  board_open_scanner: 'Scan',
  board_status_change: 'Status wijzigen',
  board_mark_verified: 'Markeer geverifieerd',
  board_mark_missing: 'Markeer mist',
  board_mark_damaged: 'Markeer beschadigd',
  board_mark_expected: 'Terug naar verwacht',
  scan_aim: 'Houd Tek nr én Spool binnen het vak',
  scan_holding: 'Stilhouden...',
  scan_no_active: 'Geen actieve levering geselecteerd.',
  scan_camera_failed: 'Camera kon niet starten',
  scan_match_found: 'Match gevonden',
  scan_confirm: 'Bevestig',
  scan_wrong_match: 'Foutieve match',
  scan_not_found: 'Niet op de lijst',
  scan_add_uncharted: 'Voeg toe aan Onbekend',
  scan_try_again: 'Opnieuw',
  scan_partial_title: 'Welke spool?',
  scan_partial_help: 'OCR kon de spool-letter niet lezen.',
  scan_fuzzy_title: 'Scan bevestigen',
  scan_fuzzy_help: 'OCR-resultaat was onzeker. Bedoelde je:',
  uncharted_title: 'Onbekende items',
  uncharted_empty: 'Nog geen onbekende scans.',
  uncharted_subtitle:
    'Scans die niet matchen met de actieve lijst. Tik om een dispositie toe te wijzen.',
  disp_unassigned: 'Niet toegewezen',
  disp_wrong_project: 'Verkeerd project',
  disp_other_system: 'Ander systeem',
  disp_advance: 'Vooruitlevering',
  disp_investigate: 'Onderzoeken',
  disp_resolved: 'Opgelost',
  settings_title: 'Instellingen',
  settings_language: 'Taal',
  settings_haptic: 'Trillen bij scan',
  settings_sound: 'Geluid bij scan',
  settings_confirm_verified: 'Bevestig vóór verifiëren',
  settings_confirm_uncharted: 'Bevestig vóór toevoegen aan Onbekend',
  settings_auto_confirm: 'Auto-bevestigen (geen dialogen)',
  settings_threshold: 'Drempel matchbetrouwbaarheid',
  settings_backup: 'Back-up & herstel',
  settings_export_json: 'Export back-up (.json)',
  settings_import_json: 'Herstel uit back-up',
  settings_about: 'Over',
};

export type TKey = keyof typeof en;
const dictionaries: Record<Lang, Record<TKey, string>> = { en, nl };

export function t(lang: Lang, key: TKey): string {
  return dictionaries[lang][key] ?? key;
}

/** Hook that returns the current language and a translator function.
 *  Persisted to settings so it survives reload. */
export function useLang(): {
  lang: Lang;
  setLang: (l: Lang) => Promise<void>;
  t: (k: TKey) => string;
} {
  const [lang, setLangState] = useState<Lang>('en');
  useEffect(() => {
    loadSettings().then((s) => setLangState(s.language));
  }, []);
  const setLang = async (l: Lang) => {
    setLangState(l);
    await saveSetting('language', l);
  };
  return { lang, setLang, t: (k) => dictionaries[lang][k] ?? k };
}
