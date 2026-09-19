import { useState, useEffect } from 'react';
import { getCities, getCityEmployees, getTimesheet } from '../api';
import { City, Employee } from '../types';
import TimesheetPreview from '../components/TimesheetPreview';
import { exportToExcel } from '../utils/excelExport';

interface ExpandedState {
  [cityId: string]: boolean;
}

const Export = () => {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  // Поточна дата для табелів
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

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

  const handlePrint = (cityId: string, cityName: string) => {
    console.log('Print clicked for:', cityName);
    // Відкриваємо діалог друку для розгорнутої таблиці
    window.print();
  };

  const handleExport = async (cityId: string, cityName: string) => {
    console.log('Export clicked for:', cityName);
    try {
      // Завантажуємо дані для експорту
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
      const employeesResponse = await getCityEmployees(cityId);
      const employeesList = employeesResponse.data;

      // Завантажуємо табелі для кожного працівника
      const employeesWithHours = await Promise.all(
        employeesList.map(async (employee: Employee) => {
          try {
            const timesheetResponse = await getTimesheet(employee._id, currentYear, currentMonth);
            const timesheetDays = timesheetResponse.data.days || [];

            const hours = Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dayData = timesheetDays.find((d: any) => d.day === day);
              return dayData?.hours ?? null;
            });

            const totalHours = hours.reduce((sum, h) => sum + (h || 0), 0);

            return {
              fullName: employee.fullName,
              hours,
              totalHours,
            };
          } catch (error) {
            console.error(`Failed to load timesheet for employee ${employee._id}:`, error);
            return {
              fullName: employee.fullName,
              hours: Array(daysInMonth).fill(null),
              totalHours: 0,
            };
          }
        })
      );

      // Експортуємо в Excel
      exportToExcel(cityName, currentYear, currentMonth, employeesWithHours);
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
