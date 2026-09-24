import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { getCityEmployees, createEmployee, deleteEmployee, getCities } from '../api';
import { Employee, City } from '../types';
import MoveEmployeeModal from '../components/MoveEmployeeModal';
import PhotoUpload from '../components/PhotoUpload';

const CityEmployees = () => {
  const { cityId } = useParams<{ cityId: string }>();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [moveEmployee, setMoveEmployee] = useState<Employee | null>(null);
  const [search, setSearch] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    birthDate: '',
  });
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null); 

  useEffect(() => {
    loadEmployees();
    loadCities();
  }, [cityId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideDesktop = menuRef.current?.contains(target);
      const insideMobile = mobileMenuRef.current?.contains(target);
      if (!insideDesktop && !insideMobile) {
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
    }
  };

  const loadEmployees = async () => {
    if (!cityId) return;
    try {
      const response = await getCityEmployees(cityId);
      setEmployees(response.data);
    } catch (error) {
      console.error('Failed to load employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEmployee = async () => {
    if (!formData.fullName.trim() || !cityId) return;

    try {
      await createEmployee({
        cityId,
        fullName: formData.fullName,
        birthDate: formData.birthDate || null,
      });
      setFormData({ fullName: '', birthDate: '' });
      setIsAdding(false);
      loadEmployees();
    } catch (error) {
      console.error('Failed to create employee:', error);
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm('Видалити працівника?')) return;

    try {
      await deleteEmployee(id);
      loadEmployees();
    } catch (error) {
      console.error('Failed to delete employee:', error);
    } finally {
      setOpenMenuId(null);
    }
  };

  const currentCity = cities.find((c) => c._id === cityId);

  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.trim().toLowerCase();
    return employees.filter((e) => e.fullName.toLowerCase().includes(q));
  }, [employees, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400 text-sm">Завантаження...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-10 bg-[#fafafb] min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Mobile header */}
        <div className="flex items-center gap-2 mb-1 md:hidden">
          <button onClick={() => navigate(-1)} className="text-gray-700 -ml-1 p-1.5">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 truncate">
            {currentCity?.name ?? ''}
          </h1>
        </div>
        <p className="text-sm text-gray-400 mb-4 md:hidden">
          {employees.length} працівників
        </p>

        {/* Desktop breadcrumb + header */}
        <div className="hidden md:block text-xs text-gray-400 mb-2">
          <button onClick={() => navigate('/')} className="hover:text-gray-600">
            Міста
          </button>
          {currentCity && <span> / {currentCity.name}</span>}
        </div>
        <div className="hidden md:block mb-6">
          <h1 className="text-[26px] font-bold text-gray-900">
            Працівники міста {currentCity?.name ?? ''}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{employees.length} працівників</p>
        </div>

        {/* Toolbar: search on top, button below on mobile (thanks to flex-col-reverse) */}
        <div className="flex flex-col-reverse sm:flex-row gap-3 mb-6">
          <button
            onClick={() => setIsAdding(true)}
            className="bg-primary text-white w-full sm:w-auto px-5 py-2.5 rounded-lg hover:bg-green-600 transition-colors text-sm font-semibold whitespace-nowrap"
          >
            + Додати працівника
          </button>
          <div className="relative flex-1 sm:max-w-xs">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
              🔍
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук працівника"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>

        {/* Add Employee Form */}
        {isAdding && (
          <div className="bg-white p-5 rounded-2xl border border-gray-200 mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Новий працівник</h2>
            <div className="space-y-3">
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="Повне ім'я"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                autoFocus
              />
              <input
                type="date"
                value={formData.birthDate}
                onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleCreateEmployee}
                  className="bg-primary text-white px-5 py-2.5 rounded-lg hover:bg-green-600 transition-colors text-sm font-semibold"
                >
                  Зберегти
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setFormData({ fullName: '', birthDate: '' });
                  }}
                  className="bg-white text-gray-500 border border-gray-200 px-5 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-sm font-semibold"
                >
                  Скасувати
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Desktop table */}
        {filteredEmployees.length > 0 && (
          <div className="hidden md:block bg-white rounded-2xl pb-20 border border-gray-200 overflow-hidden">
            <div className="flex items-center px-6 py-3 bg-[#fafafb] border-b border-gray-200 text-xs font-semibold text-gray-400">
              <div className="flex-1">Працівник</div>
              <div className="w-40">Дата народження</div>
              <div className="w-40">Додано</div>
              <div className="w-10" />
            </div>

            {filteredEmployees.map((employee) => {
              const addedAt = (employee as any).createdAt;
              return (
                <div
                  key={employee._id}
                  className="flex items-center px-6 py-4 border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                      <PhotoUpload
                        employeeId={employee._id}
                        currentPhotoUrl={employee.photoUrl}
                        onPhotoUpdated={() => loadEmployees()}
                      />
                    </div>
                    <button
                      onClick={() => navigate(`/employees/${employee._id}/timesheet?cityId=${cityId}`)}
                      className="text-sm font-semibold text-gray-900 hover:text-primary transition-colors text-left truncate"
                    >
                      {employee.fullName}
                    </button>
                  </div>

                  <div className="w-40 text-sm text-gray-500">
                    {employee.birthDate
                      ? new Date(employee.birthDate).toLocaleDateString('uk-UA')
                      : '—'}
                  </div>

                  <div className="w-40 text-sm text-gray-500">
                    {addedAt ? new Date(addedAt).toLocaleDateString('uk-UA') : '—'}
                  </div>

                  <div
                    className="relative w-10 flex justify-end"
                    ref={openMenuId === employee._id ? menuRef : null}
                  >
                    <button
                      onClick={() => setOpenMenuId(openMenuId === employee._id ? null : employee._id)}
                      className="text-gray-400 hover:text-gray-600 px-1 text-lg leading-none"
                      aria-label="Опції працівника"
                    >
                      •••
                    </button>

                    {openMenuId === employee._id && (
                      <div className="absolute right-0 top-6 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10">
                        <button
                          onClick={() => {
                            setOpenMenuId(null);
                            navigate(`/employees/${employee._id}/timesheet?cityId=${cityId}`);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Робочі дні
                        </button>
                        <button
                          onClick={() => {
                            setOpenMenuId(null);
                            setMoveEmployee(employee);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Перемістити
                        </button>
                        <button
                          onClick={() => handleDeleteEmployee(employee._id)}
                          className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50"
                        >
                          Видалити
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Mobile card list */}
        {filteredEmployees.length > 0 && (
          <div className="md:hidden space-y-3 pb-4">
            {filteredEmployees.map((employee) => (
              <div
                key={employee._id}
                className="relative flex items-center gap-3 bg-white rounded-2xl border border-gray-200 p-3"
              >
                <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                  <PhotoUpload
                    employeeId={employee._id}
                    currentPhotoUrl={employee.photoUrl}
                    onPhotoUpdated={() => loadEmployees()}
                  />
                </div>

                <button
                  onClick={() => navigate(`/employees/${employee._id}/timesheet?cityId=${cityId}`)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {employee.fullName}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {employee.birthDate
                      ? new Date(employee.birthDate).toLocaleDateString('uk-UA')
                      : '—'}
                  </div>
                </button>

                <button
                  onClick={() => setOpenMenuId(openMenuId === employee._id ? null : employee._id)}
                  className="text-gray-300 px-1 shrink-0 text-lg leading-none"
                  aria-label="Опції працівника"
                >
                  •••
                </button>

                <ChevronRight
                  onClick={() => navigate(`/employees/${employee._id}/timesheet?cityId=${cityId}`)}
                  className="w-4 h-4 text-gray-300 shrink-0 cursor-pointer"
                />

                {openMenuId === employee._id && (
                  <div
                    ref={mobileMenuRef}
                    className="absolute right-3 top-12 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10"
                  >
                    <button
                      onClick={() => {
                        setOpenMenuId(null);
                        navigate(`/employees/${employee._id}/timesheet?cityId=${cityId}`);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Робочі дні
                    </button>
                    <button
                      onClick={() => {
                        setOpenMenuId(null);
                        setMoveEmployee(employee);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Перемістити
                    </button>
                    <button
                      onClick={() => handleDeleteEmployee(employee._id)}
                      className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50"
                    >
                      Видалити
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {employees.length === 0 && !isAdding && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-base">Працівників ще немає</p>
            <p className="text-sm mt-1">Натисніть «Додати працівника» для створення</p>
          </div>
        )}

        {employees.length > 0 && filteredEmployees.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-base">Нічого не знайдено</p>
            <p className="text-sm mt-1">Спробуйте інший запит пошуку</p>
          </div>
        )}

        {/* Move Employee Modal */}
        {moveEmployee && (
          <MoveEmployeeModal
            employee={moveEmployee}
            cities={cities}
            onClose={() => setMoveEmployee(null)}
            onMoved={loadEmployees}
          />
        )}
      </div>
    </div>
  );
};

export default CityEmployees;