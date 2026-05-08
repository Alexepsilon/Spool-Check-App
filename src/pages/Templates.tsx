import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { deleteTemplate, listTemplates } from '../lib/db';
import type { Template } from '../lib/types';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    void refresh();
  }, []);

  const refresh = async () => setTemplates(await listTemplates());

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    await deleteTemplate(id);
    void refresh();
  };

  return (
    <Layout title="Tag templates" showBack>
      <div className="p-3 text-sm text-gray-600 bg-blue-50 border-b">
        Templates let you mark where each field lives on a fabricator's tag.
        Future scans crop to those regions, dramatically improving OCR
        reliability — the same approach credit-card scanners use.
      </div>

      {templates.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="text-5xl mb-3">📐</div>
          <h2 className="font-semibold mb-1">No templates yet</h2>
          <p className="text-sm text-gray-600 mb-6">
            Create one for each fabricator's tag style you encounter.
          </p>
          <Link
            to="/templates/new"
            className="bg-primary text-white px-6 py-3 rounded-lg font-medium"
          >
            + New template
          </Link>
        </div>
      ) : (
        <>
          <ul className="divide-y bg-white flex-1">
            {templates.map((t) => (
              <li key={t.id} className="flex items-stretch">
                <Link
                  to={`/templates/${t.id}`}
                  className="flex flex-1 gap-3 px-3 py-3 active:bg-gray-100 min-w-0"
                >
                  <img
                    src={t.referenceImage}
                    alt=""
                    className="w-14 h-14 object-cover rounded border flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{t.name}</div>
                    {t.fabricator && (
                      <div className="text-xs text-gray-500 truncate">
                        {t.fabricator}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-0.5">
                      {t.fields.length} field{t.fields.length === 1 ? '' : 's'}
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => onDelete(t.id, t.name)}
                  className="px-3 text-red-600 text-xs"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <div className="p-3 bg-white border-t">
            <Link
              to="/templates/new"
              className="block w-full bg-accent text-white text-center rounded-lg py-3 font-medium active:scale-95"
            >
              + New template
            </Link>
          </div>
        </>
      )}
    </Layout>
  );
}
