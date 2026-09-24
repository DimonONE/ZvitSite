import { useState, useEffect } from 'react';
import { getCities, exportCityMonth } from '../api';
import { City } from '../types';
import TimesheetPreview from '../components/TimesheetPreview';

interface ExpandedState {
  [cityId: string]: boolean;
}

const Export = () => {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  // Період табелів: за замовчуванням поточний місяць, але його можна змінити
  // (імпортоване фото зазвичай стосується іншого, вже минулого місяця).
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1);
  const MONTH_NAMES = [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
  ];
  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i);

  useEffect(() => {
    loadCities();
  }, []);

  const loadCities = async () => {
    setLoading(true);
    try {
      const response = await getCities();
      setCities(response.data);
    } catch (error) {
      console.error('Failed to load cities:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (cityId: string) => {
    setExpanded((prev) => ({
      ...prev,
      [cityId]: !prev[cityId],
    }));
  };

  const handlePrint = (_cityId: string, cityName: string) => {
    console.log('Print clicked for:', cityName);
    // Відкриваємо діалог друку для розгорнутої таблиці
    window.print();
  };

  // Файл будує сервер (ExcelJS) з бази для обраного міста і місяця/року —
  // той самий, що показує прев'ю, у форматі еталонного зразка.
  const handleExport = async (cityId: string, cityName: string) => {
    try {
      const response = await exportCityMonth(cityId, currentYear, currentMonth);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${cityName.replace(/\s+/g, '_')}__${String(currentMonth).padStart(2, '0')}_${String(
        currentYear % 100
      ).padStart(2, '0')}_.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export:', error);
      alert('Помилка експорту');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Завантаження...</div>
      </div>
    );
  }

  return (
    <div className="bg-[#fafafc] min-h-screen px-4 py-4 md:px-10 md:py-8">
      {/* Mobile header */}
      <div className="flex items-center gap-3 md:hidden mb-4">
        <h1 className="text-[#1c2126] text-lg font-bold">Експорт</h1>
      </div>

      {/* Desktop header */}
      <div className="hidden md:block mb-6">
        <h1 className="text-[#1c2126] text-2xl font-bold">Експорт табелів</h1>
        <p className="text-[#737a85] text-sm mt-1">Оберіть місто для експорту або друку табелів</p>
      </div>

      {/* Period picker */}
      <div className="flex gap-2 mb-4">
        <select
          value={currentMonth}
          onChange={(e) => setCurrentMonth(Number(e.target.value))}
          className="h-9 px-3 bg-white border border-[#e5e8ed] rounded-lg text-sm text-[#1c2126]"
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={i + 1} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={currentYear}
          onChange={(e) => setCurrentYear(Number(e.target.value))}
          className="h-9 px-3 bg-white border border-[#e5e8ed] rounded-lg text-sm text-[#1c2126]"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* City cards */}
      <div className="flex flex-col gap-3">
        {cities.map((city) => (
          <div key={city._id} className="bg-white border border-[#e5e8ed] rounded-xl overflow-hidden">
            {/* Card header */}
            <div className="flex items-center gap-3 p-4">
              {/* Expand button */}
              <button
                type="button"
                onClick={() => toggleExpand(city._id)}
                className="flex items-center justify-center size-8 rounded-lg bg-[#fafafc] border border-[#e5e8ed] text-[#737a85] hover:bg-[#f0f0f0] transition-colors shrink-0"
                aria-label={expanded[city._id] ? 'Згорнути' : 'Розгорнути'}
              >
                <span className={`text-sm transition-transform ${expanded[city._id] ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>

              {/* City name */}
              <div className="flex-1">
                <h2 className="text-[#1c2126] text-base font-semibold">{city.name}</h2>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrint(city._id, city.name);
                  }}
                  className="flex items-center gap-2 px-4 h-9 bg-white border border-[#e5e8ed] rounded-lg text-[#1c2126] text-sm font-medium hover:bg-[#fafafc] transition-colors"
                >
                  <span>🖨️</span>
                  <span className="hidden sm:inline">Друк</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExport(city._id, city.name);
                  }}
                  className="flex items-center gap-2 px-4 h-9 bg-[#21ba6b] rounded-lg text-white text-sm font-medium hover:bg-[#1da55e] transition-colors"
                >
                  <span>📥</span>
                  <span className="hidden sm:inline">Експорт</span>
                </button>
              </div>
            </div>

            {/* Expandable content */}
            {expanded[city._id] && (
              <div className="border-t border-[#e5e8ed] p-4 bg-[#fafafc]">
                <TimesheetPreview
                  cityId={city._id}
                  cityName={city.name}
                  year={currentYear}
                  month={currentMonth}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {cities.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[#737a85] text-sm">Немає міст для відображення</p>
        </div>
      )}
    </div>
  );
};

export default Export;
