import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCities, createCity, deleteCity } from '../api';
import { City } from '../types';
import QuickPhotoImportModal from '../components/QuickPhotoImportModal';

// Cycle of accent colors for city icons, matching the design's varied palette
const ICON_COLORS = [
  { bg: 'bg-blue-50', fg: 'text-blue-500' },
  { bg: 'bg-orange-50', fg: 'text-orange-500' },
  { bg: 'bg-emerald-50', fg: 'text-emerald-500' },
  { bg: 'bg-amber-50', fg: 'text-amber-500' },
  { bg: 'bg-violet-50', fg: 'text-violet-500' },
  { bg: 'bg-rose-50', fg: 'text-rose-500' },
];

const BuildingIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} width={22} height={22}>
    <rect x="4" y="3" width="16" height="18" rx="2" fill="currentColor" fillOpacity="0.15" />
    <rect x="7" y="6" width="3" height="3" rx="0.5" fill="currentColor" />
    <rect x="14" y="6" width="3" height="3" rx="0.5" fill="currentColor" />
    <rect x="7" y="11" width="3" height="3" rx="0.5" fill="currentColor" />
    <rect x="14" y="11" width="3" height="3" rx="0.5" fill="currentColor" />
    <rect x="9.5" y="16" width="5" height="5" rx="0.5" fill="currentColor" />
  </svg>
);

const Dashboard = () => {
  const [cities, setCities] = useState<City[]>([]);
  const [newCityName, setNewCityName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadCities();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadCities = async () => {
    try {
      const response = await getCities();
      setCities(response.data);
    } catch (error) {
      console.error('Failed to load cities:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCity = async () => {
    if (!newCityName.trim()) return;

    try {
      await createCity(newCityName);
      setNewCityName('');
      setIsAdding(false);
      loadCities();
    } catch (error) {
      console.error('Failed to create city:', error);
    }
  };

  const handleDeleteCity = async (id: string) => {
    if (!confirm('Видалити місто?')) return;

    try {
      await deleteCity(id);
      loadCities();
    } catch (error) {
      console.error('Failed to delete city:', error);
    } finally {
      setOpenMenuId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400 text-sm">Завантаження...</div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 bg-[#fafafb] min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold text-gray-900">Мої міста</h1>
            <p className="text-sm text-gray-500 mt-1">Огляд категорій міст та працівників</p>
          </div>
          <button
            onClick={() => setPhotoModalOpen(true)}
            className="bg-[#21ba6b] text-white px-5 py-2.5 rounded-lg hover:bg-green-600 transition-colors text-sm font-semibold flex items-center justify-center gap-2 shrink-0"
          >
            📷 Завантажити фото табеля
          </button>
        </div>

        {photoModalOpen && (
          <QuickPhotoImportModal
            cities={cities}
            onClose={() => setPhotoModalOpen(false)}
            onDataChanged={loadCities}
          />
        )}

        {/* Add City inline form */}
        {isAdding && (
          <div className="bg-white p-5 rounded-2xl border border-gray-200 mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Нове місто</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={newCityName}
                onChange={(e) => setNewCityName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCity()}
                placeholder="Назва міста"
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateCity}
                  className="bg-primary text-white px-5 py-2.5 rounded-lg hover:bg-green-600 transition-colors text-sm font-semibold"
                >
                  Зберегти
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setNewCityName('');
                  }}
                  className="bg-white text-gray-500 border border-gray-200 px-5 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-sm font-semibold"
                >
                  Скасувати
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cities Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {cities.map((city, i) => {
            const color = ICON_COLORS[i % ICON_COLORS.length];
            const employeeCount = (city as any).employeeCount;
            const recordsCount = (city as any).recordsCount;

            return (
              <div
                key={city._id}
                onClick={() => navigate(`/cities/${city._id}/employees`)}
                className="bg-white rounded-2xl border border-gray-200 p-5 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color.bg} ${color.fg}`}>
                    <BuildingIcon />
                  </div>

                  <div className="relative" ref={openMenuId === city._id ? menuRef : null}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === city._id ? null : city._id);
                      }}
                      className="text-gray-400 hover:text-gray-600 px-1 text-lg leading-none"
                      aria-label="Опції міста"
                    >
                      •••
                    </button>

                    {openMenuId === city._id && (
                      <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/cities/${city._id}/employees`);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Переглянути
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCity(city._id);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50"
                        >
                          Видалити
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <h3 className="text-[17px] font-semibold text-gray-900 mb-1">{city.name}</h3>
                <p className="text-[13px] text-gray-500">
                  {employeeCount != null
                    ? `${employeeCount} працівників`
                    : `Створено: ${new Date(city.createdAt).toLocaleDateString('uk-UA')}`}
                  {recordsCount != null && ` · ${recordsCount} записів дня`}
                </p>
              </div>
            );
          })}

          {/* Add city card */}
          {!isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 py-10 text-gray-400 hover:text-primary hover:border-primary/40 transition-colors"
            >
              <span className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-xl">
                +
              </span>
              <span className="text-sm font-medium">Додати місто</span>
            </button>
          )}
        </div>

        {cities.length === 0 && !isAdding && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-base">Міст ще немає</p>
            <p className="text-sm mt-1">Натисніть «Додати місто» для створення</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;