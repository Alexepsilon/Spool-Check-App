import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { getTemplate, saveTemplate } from '../lib/db';
import type { Template, TemplateField, TemplateFieldKind } from '../lib/types';

/**
 * Wizard-style template editor.
 *
 * Flow:
 *   1. User takes a photo of a representative tag (or picks one
 *      from the gallery).
 *   2. For each known field (drawing, spool, paint, ral, scope), the
 *      app prompts the user to drag a box on the photo. The box is
 *      saved in normalised 0..1 coordinates so it's resolution-
 *      independent.
 *   3. User names the template and saves.
 *
 * Future scans can use those normalised boxes to crop & OCR each
 * field separately, giving Tesseract a much smaller and more
 * targeted region — the "constrain the problem" approach that makes
 * credit-card scanners reliable.
 */
const FIELDS_TO_MARK: { kind: TemplateFieldKind; label: string }[] = [
  { kind: 'drawing', label: 'Drawing number (Tek nr)' },
  { kind: 'spool', label: 'Spool letter' },
  { kind: 'paint', label: 'Paint system / Verfsysteem' },
  { kind: 'ral', label: 'RAL' },
  { kind: 'scope', label: 'Scope nr' },
];

export default function TemplateEditorPage() {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const isEdit = !!templateId && templateId !== 'new';

  const [name, setName] = useState('');
  const [fabricator, setFabricator] = useState('');
  const [imageData, setImageData] = useState<string | null>(null);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [currentFieldIdx, setCurrentFieldIdx] = useState(0);
  const [drawing, setDrawing] = useState<null | {
    startX: number;
    startY: number;
    curX: number;
    curY: number;
  }>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEdit && templateId) {
      void getTemplate(templateId).then((t) => {
        if (t) {
          setName(t.name);
          setFabricator(t.fabricator ?? '');
          setImageData(t.referenceImage);
          setFields(t.fields);
          setCurrentFieldIdx(t.fields.length);
        }
      });
    }
  }, [isEdit, templateId]);

  const onPickPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result);
      setImageData(data);
      setFields([]);
      setCurrentFieldIdx(0);
    };
    reader.readAsDataURL(file);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current || !imageData) return;
    if (currentFieldIdx >= FIELDS_TO_MARK.length) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setDrawing({ startX: x, startY: y, curX: x, curY: y });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setDrawing({ ...drawing, curX: x, curY: y });
  };

  const onPointerUp = () => {
    if (!drawing) return;
    const x1 = Math.min(drawing.startX, drawing.curX);
    const y1 = Math.min(drawing.startY, drawing.curY);
    const x2 = Math.max(drawing.startX, drawing.curX);
    const y2 = Math.max(drawing.startY, drawing.curY);
    const w = x2 - x1;
    const h = y2 - y1;
    setDrawing(null);
    // Reject taps and tiny accidental boxes.
    if (w < 0.04 && h < 0.04) return;
    if (currentFieldIdx >= FIELDS_TO_MARK.length) return;
    const target = FIELDS_TO_MARK[currentFieldIdx];
    const newField: TemplateField = {
      id: crypto.randomUUID(),
      kind: target.kind,
      label: target.label,
      x: x1,
      y: y1,
      w,
      h,
    };
    setFields((arr) => [...arr.filter((f) => f.kind !== target.kind), newField]);
    setCurrentFieldIdx((i) => i + 1);
  };

  const removeField = (id: string) => {
    setFields((arr) => arr.filter((f) => f.id !== id));
    // Reset wizard so the user can re-mark fields they removed.
    const remaining = fields.filter((f) => f.id !== id);
    setCurrentFieldIdx(remaining.length);
  };

  const skipField = () => setCurrentFieldIdx((i) => i + 1);

  const canSave =
    !!imageData && name.trim().length > 0 && fields.some((f) => f.kind === 'drawing');

  const onSave = async () => {
    if (!canSave || !imageData) return;
    const id = isEdit && templateId ? templateId : crypto.randomUUID();
    const t: Template = {
      id,
      name: name.trim(),
      fabricator: fabricator.trim() || undefined,
      referenceImage: imageData,
      fields,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveTemplate(t);
    navigate('/templates', { replace: true });
  };

  const currentTarget =
    currentFieldIdx < FIELDS_TO_MARK.length
      ? FIELDS_TO_MARK[currentFieldIdx]
      : null;

  return (
    <Layout title={isEdit ? 'Edit template' : 'New template'} showBack>
      <div className="p-4 max-w-md w-full mx-auto">
        {!imageData ? (
          <PhotoPicker
            inputRef={photoInputRef}
            onFile={onPickPhoto}
          />
        ) : (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3 text-sm">
              {currentTarget ? (
                <>
                  <div className="font-semibold">
                    Step {currentFieldIdx + 1} of {FIELDS_TO_MARK.length}
                  </div>
                  <div className="mt-1">
                    Drag a box around the <strong>{currentTarget.label}</strong>{' '}
                    on the photo.
                  </div>
                  <button
                    onClick={skipField}
                    className="mt-2 text-xs text-blue-700 underline"
                  >
                    Skip this field
                  </button>
                </>
              ) : (
                <div className="font-medium">
                  All fields marked. Set a name and save below.
                </div>
              )}
            </div>

            <div
              ref={containerRef}
              className="relative w-full aspect-[3/4] bg-black overflow-hidden rounded select-none touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {/* Reference image */}
              <img
                src={imageData}
                alt="template reference"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />
              {/* Saved field boxes */}
              {fields.map((f) => (
                <div
                  key={f.id}
                  className="absolute border-2 border-yellow-300 bg-yellow-300/15"
                  style={{
                    left: `${f.x * 100}%`,
                    top: `${f.y * 100}%`,
                    width: `${f.w * 100}%`,
                    height: `${f.h * 100}%`,
                  }}
                >
                  <span className="absolute top-0 left-0 -translate-y-full bg-yellow-300 text-black text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase">
                    {f.kind}
                  </span>
                </div>
              ))}
              {/* Currently-being-drawn box */}
              {drawing && (
                <div
                  className="absolute border-2 border-blue-400 bg-blue-400/20"
                  style={{
                    left: `${Math.min(drawing.startX, drawing.curX) * 100}%`,
                    top: `${Math.min(drawing.startY, drawing.curY) * 100}%`,
                    width: `${Math.abs(drawing.curX - drawing.startX) * 100}%`,
                    height: `${Math.abs(drawing.curY - drawing.startY) * 100}%`,
                  }}
                />
              )}
            </div>

            <ul className="mt-3 bg-white border rounded divide-y text-sm">
              {fields.length === 0 && (
                <li className="px-3 py-2 text-gray-500 italic">
                  No fields marked yet
                </li>
              )}
              {fields.map((f) => (
                <li key={f.id} className="flex items-center px-3 py-2 gap-2">
                  <span className="font-mono text-xs uppercase bg-yellow-100 px-1.5 py-0.5 rounded">
                    {f.kind}
                  </span>
                  <span className="flex-1 text-gray-700 text-xs truncate">
                    {f.label}
                  </span>
                  <button
                    onClick={() => removeField(f.id)}
                    className="text-red-600 text-xs"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-4 space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Template name (e.g. XYCLE yellow tag)"
                className="w-full border rounded px-3 py-2 bg-white"
              />
              <input
                value={fabricator}
                onChange={(e) => setFabricator(e.target.value)}
                placeholder="Fabricator (optional, e.g. Bakker Nedam)"
                className="w-full border rounded px-3 py-2 bg-white"
              />
              <button
                onClick={onSave}
                disabled={!canSave}
                className="w-full bg-accent text-white rounded py-3 font-medium disabled:opacity-50 active:scale-95"
              >
                Save template
              </button>
              {currentFieldIdx < FIELDS_TO_MARK.length && (
                <p className="text-xs text-gray-500 text-center">
                  At least the Drawing field is required to save.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function PhotoPicker({
  inputRef,
  onFile,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Take a sharp photo of a representative tag. You'll mark each field on
        it in the next step. Try to keep the tag flat and well-lit; a rough
        shot still works but a clean reference makes future scans more
        reliable.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full border-2 border-dashed border-gray-300 rounded-lg py-12 text-gray-700 active:bg-gray-50"
      >
        📷  Take or pick a photo
      </button>
    </div>
  );
}
