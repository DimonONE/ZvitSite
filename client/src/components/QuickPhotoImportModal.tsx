import { useRef, useState } from 'react';
import {
  importCitySheetPhoto,
  updateTimesheet,
  createEmployee,
  getCityEmployees,
  exportCityMonth,
  CitySheetImportResult,
} from '../api';
import { City, Employee } from '../types';

interface QuickPhotoImportModalProps {
  cities: City[];
  onClose: () => void;
  onDataChanged: () => void;
}

interface EmployeeOption extends Employee {
  cityName: string;
}

// Перетворює масив годин (index 0 = день 1) у формат, який очікує
// PUT /employees/:id/timesheets/:year/:month
const hoursToDays = (hours: (number | null)[]) =>
  hours.map((h, idx) => ({
    day: idx + 1,
    hours: h,
    status: h !== null ? ('worked' as const) : ('weekend' as const),
  }));

// Модалка на дашборді: завантажуєте ОДНЕ фото зведеного табеля по місту —
// система сама розпізнає всіх працівників і години, зіставляє імена з базою
// і одразу зберігає в MongoDB. Місто/працівника заздалегідь обирати не треба.
const QuickPhotoImportModal = ({ cities, onClose, onDataChanged }: QuickPhotoImportModalProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CitySheetImportResult | null>(null);

  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [newEmployeeCityId, setNewEmployeeCityId] = useState<Record<number, string>>({});

  const loadEmployeeOptions = async (resolvedCityId?: string) => {
    setLoadingEmployees(true);
    try {
      const targetCities = resolvedCityId ? cities.filter((c) => c._id === resolvedCityId) : cities;
      const results = await Promise.all(targetCities.map((c) => getCityEmployees(c._id)));
      const options: EmployeeOption[] = [];
      results.forEach((res, i) => {
        res.data.forEach((e) => options.push({ ...e, cityName: targetCities[i].name }));
      });
      setEmployeeOptions(options);
    } catch (err) {
      console.error('Failed to load employees for matching:', err);
    } finally {
      setLoadingEmployees(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Оберіть, будь ласка, зображення');
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const response = await importCitySheetPhoto(file);
      setResult(response.data);
      onDataChanged();
      if (response.data.unmatched.length > 0) {
        loadEmployeeOptions(response.data.resolvedCity?._id);
      }
    } catch (err: any) {
      console.error('Failed to import city sheet photo:', err);
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

  const removeUnmatched = (index: number) => {
    setResult((prev) => (prev ? { ...prev, unmatched: prev.unmatched.filter((_, i) => i !== index) } : prev));
  };

  const handleAssignExisting = async (index: number, employeeId: string) => {
    if (!result) return;
    const item = result.unmatched[index];
    await updateTimesheet(employeeId, result.year, result.month, { days: hoursToDays(item.hours) });
    removeUnmatched(index);
    onDataChanged();
  };

  const handleCreateAndAssign = async (index: number) => {
    if (!result) return;
    const item = result.unmatched[index];
    const cityId = newEmployeeCityId[index] || result.resolvedCity?._id || cities[0]?._id;
    if (!cityId) return;

    const created = await createEmployee({ fullName: item.recognizedName, cityId });
    await updateTimesheet(created.data._id, result.year, result.month, { days: hoursToDays(item.hours) });
    removeUnmatched(index);
    onDataChanged();
  };

  const handleDownload = async () => {
    if (!result?.resolvedCity) return;
    const res = await exportCityMonth(result.resolvedCity._id, result.year, result.month);
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${result.resolvedCity.name.replace(/\s+/g, '_')}__${result.month
      .toString()
      .padStart(2, '0')}_${(result.year % 100).toString().padStart(2, '0')}_.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[#1c2126] text-lg font-bold">📷 Завантажити фото табеля</h2>
          <button onClick={onClose} className="text-[#737a85] text-xl leading-none">×</button>
        </div>

        {!result && (
          <>
            <p className="text-[#737a85] text-sm">
              Сфотографуйте зведений табель по місту — місто, місяць і кожного працівника
              програма визначить сама з фото.
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

        {result && (
          <div className="flex flex-col gap-4">
            <div className="bg-[#f2fbf6] border border-[#cdeedd] rounded-lg p-3 text-sm text-[#1c2126]">
              Розпізнано за <strong>{result.month.toString().padStart(2, '0')}.{result.year}</strong>
              {result.detectedCityName && <> · місто на фото: <strong>{result.detectedCityName}</strong></>}
            </div>

            {result.matched.length > 0 && (
              <div>
                <h3 className="text-[#1c2126] text-sm font-semibold mb-2">
                  ✅ Збережено ({result.matched.length})
                </h3>
                <div className="flex flex-col gap-1.5">
                  {result.matched.map((m) => (
                    <div key={m.employeeId} className="flex justify-between text-sm bg-[#fafafc] rounded-lg px-3 py-2">
                      <span className="text-[#1c2126]">{m.employeeName}</span>
                      <span className="text-[#737a85]">{m.totalHours} год</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.unmatched.length > 0 && (
              <div>
                <h3 className="text-[#1c2126] text-sm font-semibold mb-2">
                  ⚠️ Не знайдено в базі ({result.unmatched.length}) — оберіть, кому належить
                </h3>
                <div className="flex flex-col gap-3">
                  {result.unmatched.map((u, index) => (
                    <div key={`${u.recognizedName}-${index}`} className="border border-[#e5e8ed] rounded-lg p-3 flex flex-col gap-2">
                      <span className="text-sm font-medium text-[#1c2126]">На фото: «{u.recognizedName}»</span>

                      <select
                        onChange={(e) => {
                          if (e.target.value) handleAssignExisting(index, e.target.value);
                        }}
                        disabled={loadingEmployees}
                        className="bg-[#fafafc] border border-[#e5e8ed] h-9 px-2 rounded-lg text-sm disabled:opacity-60"
                        defaultValue=""
                      >
                        <option value="" disabled>
                          {loadingEmployees ? 'Завантаження...' : "Прив'язати до існуючого працівника..."}
                        </option>
                        {employeeOptions.map((e) => (
                          <option key={e._id} value={e._id}>{e.fullName} ({e.cityName})</option>
                        ))}
                      </select>

                      <div className="flex gap-2 items-center">
                        <span className="text-xs text-[#737a85] shrink-0">або створити нового в</span>
                        <select
                          value={newEmployeeCityId[index] || result.resolvedCity?._id || ''}
                          onChange={(e) =>
                            setNewEmployeeCityId((prev) => ({ ...prev, [index]: e.target.value }))
                          }
                          className="bg-[#fafafc] border border-[#e5e8ed] h-9 px-2 rounded-lg text-xs flex-1"
                        >
                          <option value="" disabled>місто...</option>
                          {cities.map((c) => (
                            <option key={c._id} value={c._id}>{c.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleCreateAndAssign(index)}
                          disabled={!(newEmployeeCityId[index] || result.resolvedCity?._id)}
                          className="bg-[#1c2126] text-white text-xs font-semibold px-3 h-9 rounded-lg whitespace-nowrap disabled:opacity-40"
                        >
                          + Створити
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={onClose}
                className="flex-1 bg-white border border-[#e5e8ed] h-10 rounded-lg text-sm font-semibold text-[#737a85]"
              >
                Закрити
              </button>
              {result.resolvedCity && (
                <button
                  onClick={handleDownload}
                  className="flex-1 bg-[#21ba6b] h-10 rounded-lg text-sm font-semibold text-white"
                >
                  ⬇ Excel по місту
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickPhotoImportModal;
