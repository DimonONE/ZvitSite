import { useEffect, useRef, useState } from 'react';
import {
  previewCitySheetPhoto,
  confirmCitySheetImport,
  getCityEmployees,
  exportCityMonth,
  CitySheetPreviewResult,
  CitySheetConfirmResult,
  CitySheetConfirmRow,
} from '../api';
import { Employee } from '../types';

interface QuickPhotoImportModalProps {
  onClose: () => void;
  onDataChanged: () => void;
}

// Один рядок прев'ю, який користувач може відредагувати перед збереженням:
// поправити ім'я (якщо OCR помилився), обрати "це вже існуючий працівник",
// поправити години в конкретний день, або взагалі виключити рядок з імпорту.
interface EditableRow {
  recognizedName: string;
  hours: (number | null)[];
  totalHours: number;
  photoTotal: number | null; // підсумок з фото — для звірки з сумою днів
  employeeId: string; // '' = буде створено нового працівника
  skip: boolean;
}

const monthLabel = (year: number, month: number) => `${month.toString().padStart(2, '0')}.${year}`;

// Модалка на дашборді: завантажуєте ОДНЕ фото зведеного табеля по місту —
// система розпізнає місце, всіх працівників і години, показує ТОЧНЕ прев'ю
// таблиці (у вигляді, в якому вона піде в Excel), і тільки після
// підтвердження користувачем: створює відсутнє місце (якщо такого ще нема
// в базі), створює відсутніх працівників і зберігає табель у базу.
//
// Місце НІКОЛИ не обирається вручну зі списку — воно завжди береться з
// того, що розпізналось на фото (користувач може лише виправити текст,
// якщо OCR помилився).
const QuickPhotoImportModal = ({ onClose, onDataChanged }: QuickPhotoImportModalProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'preview' | 'saved'>('upload');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<CitySheetPreviewResult | null>(null);
  const [cityName, setCityName] = useState<string>('');
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [cityEmployees, setCityEmployees] = useState<Employee[]>([]);
  const [saved, setSaved] = useState<CitySheetConfirmResult | null>(null);

  // Якщо фото розпізналось як вже існуюче місце — підвантажуємо його
  // працівників, щоб можна було вручну прив'язати рядок до когось із них
  // замість створення нового. Для нового місця (якого ще нема в базі)
  // список завжди порожній — і це правильно, там ще нікого немає.
  useEffect(() => {
    const existingCityId = preview?.resolvedCity?._id;
    if (!existingCityId) {
      setCityEmployees([]);
      return;
    }
    getCityEmployees(existingCityId)
      .then((res) => setCityEmployees(res.data))
      .catch((err) => console.error('Failed to load city employees:', err));
  }, [preview?.resolvedCity?._id]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Оберіть, будь ласка, зображення');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const response = await previewCitySheetPhoto(file);
      const data = response.data;
      setPreview(data);
      // Місце береться автоматично з фото: якщо таке вже є в базі —
      // береться його точна назва з бази, інакше — те, що розпізналось.
      setCityName(data.resolvedCity?.name || data.detectedCityName || '');
      setRows(
        data.rows.map((r) => ({
          recognizedName: r.recognizedName,
          hours: r.hours,
          totalHours: r.totalHours,
          photoTotal: r.photoTotal ?? null,
          employeeId: r.matchedEmployeeId || '',
          skip: false,
        }))
      );
      setStep('preview');
    } catch (err: any) {
      console.error('Failed to preview city sheet photo:', err);
      const detail = err?.response?.data?.error;
      setError(
        detail === 'Could not detect month/year from the photo'
          ? 'Не вдалося визначити місяць/рік із фото. Спробуйте чіткіший знімок шапки документа.'
          : 'Не вдалося розпізнати фото. Перевірте якість знімку і спробуйте ще раз.'
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const updateRow = (index: number, patch: Partial<EditableRow>) => {
    setRows((prev) => {
      const next = [...prev];
      const merged = { ...next[index], ...patch };
      if (patch.hours) {
        merged.totalHours = patch.hours.reduce((sum: number, h) => sum + (h ?? 0), 0);
      }
      next[index] = merged;
      return next;
    });
  };

  const updateHour = (rowIndex: number, dayIndex: number, raw: string) => {
    const value = raw.trim() === '' ? null : Number(raw.replace(',', '.'));
    const hours = [...rows[rowIndex].hours];
    hours[dayIndex] = value === null || Number.isNaN(value) ? null : value;
    updateRow(rowIndex, { hours });
  };

  const canConfirm = cityName.trim().length > 0;
  const isNewCity = canConfirm && !preview?.resolvedCity;

  const handleConfirm = async () => {
    if (!preview || !canConfirm) return;
    setSaving(true);
    setError(null);
    try {
      const payloadRows: CitySheetConfirmRow[] = rows.map((r) => ({
        recognizedName: r.recognizedName,
        hours: r.hours,
        employeeId: r.employeeId || null,
        skip: r.skip,
      }));
      const response = await confirmCitySheetImport({
        year: preview.year,
        month: preview.month,
        cityName: cityName.trim(),
        rows: payloadRows,
      });
      setSaved(response.data);
      setStep('saved');
      onDataChanged();
    } catch (err) {
      console.error('Failed to confirm city sheet import:', err);
      setError('Не вдалося зберегти табель. Спробуйте ще раз.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!saved) return;
    const res = await exportCityMonth(saved.cityId, saved.year, saved.month);
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${saved.cityName.replace(/\s+/g, '_')}__${saved.month
      .toString()
      .padStart(2, '0')}_${(saved.year % 100).toString().padStart(2, '0')}_.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const activeRowsCount = rows.filter((r) => !r.skip).length;
  const newEmployeesCount = rows.filter((r) => !r.skip && !r.employeeId).length;

  // Звірка з підсумком на фото: якщо сума днів не збігається — якась клітинка
  // розпізнана неправильно (найчастіше «x» замість годин).
  const isMismatch = (r: EditableRow) =>
    !r.skip && r.photoTotal !== null && Math.abs(r.photoTotal - r.totalHours) > 0.001;
  const mismatchCount = rows.filter(isMismatch).length;

  // Два рядки на одного працівника → другий перезапише перший.
  const idCounts = new Map<string, number>();
  rows.forEach((r) => {
    if (!r.skip && r.employeeId) idCounts.set(r.employeeId, (idCounts.get(r.employeeId) || 0) + 1);
  });
  const isDuplicate = (r: EditableRow) => !r.skip && !!r.employeeId && (idCounts.get(r.employeeId) || 0) > 1;
  const hasDuplicates = rows.some(isDuplicate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-4xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[#1c2126] text-lg font-bold">📷 Завантажити фото табеля</h2>
          <button onClick={onClose} className="text-[#737a85] text-xl leading-none">×</button>
        </div>

        {step === 'upload' && (
          <>
            <p className="text-[#737a85] text-sm">
              Сфотографуйте зведений табель по місту — місце, місяць і кожного працівника
              програма визначить сама з фото. Спочатку покажемо прев'ю для перевірки — у базу
              нічого не запишеться, поки ви не підтвердите.
            </p>
            <label
              className={`h-11 flex items-center justify-center gap-2 rounded-lg text-sm font-semibold cursor-pointer ${
                uploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#21ba6b] text-white'
              }`}
            >
              {uploading ? '⏳ Розпізнаємо фото...' : '📷 Обрати фото та завантажити'}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                disabled={uploading}
                className="hidden"
              />
            </label>
            {error && <p className="text-red-600 text-xs">{error}</p>}
          </>
        )}

        {step === 'preview' && preview && (
          <div className="flex flex-col gap-4">
            <div className="bg-[#f2fbf6] border border-[#cdeedd] rounded-lg p-3 text-sm text-[#1c2126]">
              Розпізнано за <strong>{monthLabel(preview.year, preview.month)}</strong>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-[#1c2126] shrink-0">Місце:</label>
              <input
                value={cityName}
                onChange={(e) => setCityName(e.target.value)}
                placeholder="Не вдалось розпізнати — введіть вручну"
                className="bg-[#fafafc] border border-[#e5e8ed] h-9 px-2 rounded-lg text-sm flex-1"
              />
              {isNewCity && (
                <span className="text-[10px] text-[#21ba6b] font-semibold whitespace-nowrap shrink-0">
                  нове, буде створено
                </span>
              )}
            </div>
            <p className="text-xs text-[#737a85] -mt-2">
              Визначається автоматично з фото. Виправте тут, тільки якщо розпізнавання
              помилилось у назві — вибирати зі списку не потрібно.
            </p>
            {!canConfirm && (
              <p className="text-xs text-amber-600">
                Не вдалося розпізнати назву місця з фото — введіть її вручну, інакше зберегти не вийде.
              </p>
            )}

            <p className="text-xs text-[#737a85]">
              Перевірте таблицю нижче — вона точно у тому вигляді, у якому піде в Excel.
              Виправте помилки розпізнавання прямо тут, приберіть зайві рядки або прив'яжіть
              їх до вже існуючих працівників. Нічого не буде збережено, поки ви не натиснете
              «Підтвердити і зберегти».
            </p>

            {mismatchCount > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-800">
                ⚠ У <strong>{mismatchCount}</strong> рядках сума днів не збігається з підсумком на фото
                (підсвічено). Швидше за все, якісь клітинки розпізнано як «x» або з іншим числом.
                У колонці «Всього» показано, що написано на фото, — знайдіть і виправте день.
              </div>
            )}
            {hasDuplicates && (
              <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-xs text-red-700">
                ⛔ Два рядки прив'язані до одного працівника — другий перезаписав би години першого.
                Змініть «Прив'язку» (наприклад, на «+ новий працівник») або пропустіть зайвий рядок.
              </div>
            )}

            <div className="overflow-x-auto border border-[#e5e8ed] rounded-lg">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="bg-[#f5f6f8]">
                    <th className="sticky left-0 bg-[#f5f6f8] p-2 text-left border-b border-[#e5e8ed] min-w-[160px]">Ім'я</th>
                    {Array.from({ length: preview.totalDays }, (_, i) => (
                      <th key={i} className="p-1 border-b border-[#e5e8ed] w-9 text-center font-normal text-[#737a85]">
                        {i + 1}
                      </th>
                    ))}
                    <th className="p-2 border-b border-[#e5e8ed] text-center min-w-[70px]">Всього</th>
                    <th className="p-2 border-b border-[#e5e8ed] text-center min-w-[90px]">Прив'язка</th>
                    <th className="p-2 border-b border-[#e5e8ed] text-center">—</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rIdx) => {
                    const bad = isMismatch(row);
                    const dup = isDuplicate(row);
                    return (
                    <tr key={rIdx} className={`${row.skip ? 'opacity-40' : ''} ${bad ? 'bg-amber-50' : ''}`}>
                      <td className="sticky left-0 bg-white p-1 border-b border-[#e5e8ed]">
                        <input
                          value={row.recognizedName}
                          onChange={(e) => updateRow(rIdx, { recognizedName: e.target.value })}
                          disabled={row.skip}
                          className="w-full bg-[#fafafc] border border-[#e5e8ed] rounded px-1.5 py-1 text-xs"
                        />
                      </td>
                      {row.hours.map((h, dIdx) => (
                        <td key={dIdx} className="p-0.5 border-b border-[#e5e8ed]">
                          <input
                            value={h ?? ''}
                            onChange={(e) => updateHour(rIdx, dIdx, e.target.value)}
                            disabled={row.skip}
                            placeholder="x"
                            className="w-9 text-center bg-[#fafafc] border border-[#e5e8ed] rounded py-1 text-xs"
                          />
                        </td>
                      ))}
                      <td
                        className={`p-1 border-b border-[#e5e8ed] text-center font-semibold ${
                          bad ? 'text-red-600' : ''
                        }`}
                      >
                        {row.totalHours}
                        {bad && (
                          <div className="text-[10px] font-normal whitespace-nowrap">
                            на фото: {row.photoTotal}
                          </div>
                        )}
                      </td>
                      <td className="p-1 border-b border-[#e5e8ed]">
                        <select
                          value={row.employeeId}
                          onChange={(e) => updateRow(rIdx, { employeeId: e.target.value })}
                          disabled={row.skip}
                          className={`w-full bg-[#fafafc] border rounded px-1 py-1 text-[11px] ${
                            dup ? 'border-red-500' : 'border-[#e5e8ed]'
                          }`}
                        >
                          <option value="">+ новий працівник</option>
                          {cityEmployees.map((e) => (
                            <option key={e._id} value={e._id}>{e.fullName}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-1 border-b border-[#e5e8ed] text-center">
                        <button
                          type="button"
                          onClick={() => updateRow(rIdx, { skip: !row.skip })}
                          className="text-[#737a85] text-xs underline"
                        >
                          {row.skip ? 'повернути' : 'пропустити'}
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-[#737a85]">
              Буде збережено рядків: <strong>{activeRowsCount}</strong>, з них нових працівників
              створиться: <strong>{newEmployeesCount}</strong>.
            </p>

            {error && <p className="text-red-600 text-xs">{error}</p>}

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => {
                  setStep('upload');
                  setPreview(null);
                  setRows([]);
                }}
                className="flex-1 bg-white border border-[#e5e8ed] h-10 rounded-lg text-sm font-semibold text-[#737a85]"
              >
                ← Переробити знімок
              </button>
              <button
                onClick={handleConfirm}
                disabled={!canConfirm || activeRowsCount === 0 || saving || hasDuplicates}
                className="flex-[2] bg-[#21ba6b] h-10 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
              >
                {saving ? '⏳ Зберігаємо...' : '✓ Підтвердити і зберегти'}
              </button>
            </div>
          </div>
        )}

        {step === 'saved' && saved && (
          <div className="flex flex-col gap-4">
            <div className="bg-[#f2fbf6] border border-[#cdeedd] rounded-lg p-3 text-sm text-[#1c2126]">
              Збережено за <strong>{monthLabel(saved.year, saved.month)}</strong> · місце{' '}
              <strong>{saved.cityName}</strong>
              {saved.cityCreated && (
                <span className="ml-1.5 text-[10px] text-[#21ba6b] font-semibold">НОВЕ МІСЦЕ</span>
              )}
            </div>
            <div>
              <h3 className="text-[#1c2126] text-sm font-semibold mb-2">
                ✅ Збережено ({saved.saved.length})
              </h3>
              <div className="flex flex-col gap-1.5">
                {saved.saved.map((s) => (
                  <div key={s.employeeId} className="flex justify-between text-sm bg-[#fafafc] rounded-lg px-3 py-2">
                    <span className="text-[#1c2126]">
                      {s.employeeName}
                      {s.created && <span className="ml-1.5 text-[10px] text-[#21ba6b] font-semibold">НОВИЙ</span>}
                    </span>
                    <span className="text-[#737a85]">{s.totalHours} год</span>
                  </div>
                ))}
              </div>
            </div>
            {saved.skipped > 0 && (
              <p className="text-xs text-[#737a85]">Пропущено рядків: {saved.skipped}</p>
            )}
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={onClose}
                className="flex-1 bg-white border border-[#e5e8ed] h-10 rounded-lg text-sm font-semibold text-[#737a85]"
              >
                Закрити
              </button>
              <button
                onClick={handleDownload}
                className="flex-1 bg-[#21ba6b] h-10 rounded-lg text-sm font-semibold text-white"
              >
                ⬇ Excel по місту
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickPhotoImportModal;