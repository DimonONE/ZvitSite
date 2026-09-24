import { useEffect, useState } from 'react';
import { getCityMonth } from '../api';

interface TimesheetPreviewProps {
  cityId: string;
  cityName: string;
  year: number;
  month: number;
}

interface EmployeeWithHours {
  _id: string;
  fullName: string;
  hours: (number | null)[];
  totalHours: number;
}

const TimesheetPreview = ({ cityId, cityName, year, month }: TimesheetPreviewProps) => {
  const [employees, setEmployees] = useState<EmployeeWithHours[]>([]);
  const [loading, setLoading] = useState(true);
  const [daysInMonth, setDaysInMonth] = useState(0);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, year, month]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Визначаємо кількість днів у місяці
      const days = new Date(year, month, 0).getDate();
      setDaysInMonth(days);

      // Один запит: години саме цього міста за місяць (працівник може мати
      // окремі табелі в різних місцях).
      const response = await getCityMonth(cityId, year, month);
      const employeesWithHours: EmployeeWithHours[] = response.data.rows.map((r) => ({
        _id: r.employeeId,
        fullName: r.fullName,
        hours: r.hours,
        totalHours: r.totalHours,
      }));

      setEmployees(employeesWithHours);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMonthName = (): string => {
    const monthNames = [
      'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
      'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
    ];
    return monthNames[month - 1];
  };

  const formatDate = (): string => {
    return `${getMonthName()} ${year}`;
  };

  const totalAllHours = employees.reduce((sum, emp) => sum + emp.totalHours, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-[#737a85] text-sm">Завантаження...</div>
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-[#737a85] text-sm">Немає працівників у цьому місті</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          {/* Перший рядок: Місто, Дата, порожні клітинки, Сумарно годин */}
          <tr className="bg-[#f0f0f0]">
            <th
              colSpan={2}
              className="border border-[#000] px-2 py-2 text-left font-bold text-[#1c2126]"
            >
              Місто: {cityName}
            </th>
            <th
              colSpan={daysInMonth - 1}
              className="border border-[#000] px-2 py-2 text-center font-bold text-[#1c2126]"
            >
              Дата: {formatDate()}
            </th>
            <th className="border border-[#000] px-2 py-2 text-center font-bold text-[#1c2126]">
              Сумарно годин: {totalAllHours}
            </th>
          </tr>

          {/* Другий рядок: №, Ім'я, числа днів місяця, Всього */}
          <tr className="bg-[#e0e0e0]">
            <th className="border border-[#000] px-2 py-2 text-center font-bold text-[#1c2126] w-[40px]">
              №
            </th>
            <th className="border border-[#000] px-2 py-2 text-left font-bold text-[#1c2126] min-w-[150px]">
              Ім'я
            </th>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
              <th
                key={day}
                className="border border-[#000] px-1.5 py-2 text-center font-bold text-[#1c2126] min-w-[32px]"
              >
                {day}
              </th>
            ))}
            <th className="border border-[#000] px-2 py-2 text-center font-bold text-[#1c2126] w-[60px]">
              Всього
            </th>
          </tr>
        </thead>

        {/* Рядки з працівниками */}
        <tbody>
          {employees.map((employee, index) => (
            <tr key={employee._id} className="bg-white">
              <td className="border border-[#000] px-2 py-2 text-center text-[#1c2126]">
                {index + 1}
              </td>
              <td className="border border-[#000] px-2 py-2 text-[#1c2126]">
                {employee.fullName}
              </td>
              {employee.hours.map((hours, dayIndex) => (
                <td
                  key={dayIndex}
                  className={`border border-[#000] px-1.5 py-2 text-center ${
                    hours === null ? 'bg-[#f5f5f5] text-[#999]' : 'text-[#1c2126]'
                  }`}
                >
                  {hours ?? '—'}
                </td>
              ))}
              <td className="border border-[#000] px-2 py-2 text-center font-bold text-[#1c2126] bg-[#f9f9f9]">
                {employee.totalHours}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TimesheetPreview;
