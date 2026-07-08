import { useParams, useNavigate } from 'react-router-dom';

interface EmployeeStats {
  filledDays: number;
  weekendDays: number;
  workedDays: number;
  lastUpdated: string;
}

const EmployeeInfo = () => {
  const { cityId, employeeId } = useParams<{ cityId: string; employeeId: string }>();
  const navigate = useNavigate();

  // TODO: замінити на реальні дані з API, наприклад getEmployee(employeeId)
  const employee = {
    name: 'Іван Петренко',
    birthDate: '07.05.1990',
    city: 'Київ',
    addedDate: '01.01.2026',
  };

  const stats: EmployeeStats = {
    filledDays: 22,
    weekendDays: 9,
    workedDays: 13,
    lastUpdated: '07.07.2026',
  };

  const initials = employee.name
    .split(' ')
    .map((part) => part[0])
    .join('');

  const handleEdit = () => {
    navigate(`/cities/${cityId}/employees/${employeeId}/edit`);
  };

  const handleDelete = () => {
    const confirmed = window.confirm(
      `Видалити працівника «${employee.name}»? Цю дію не можна скасувати.`
    );
    if (!confirmed) return;

    // TODO: викликати API видалення, наприклад deleteEmployee(employeeId)
    navigate(-1);
  };

  return (
    <div className="bg-[#fafafc] px-10 py-8">
      {/* Breadcrumb */}
      <p className="text-[#737a85] text-xs mb-2">
        Міста / {employee.city} / {employee.name}
      </p>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[#1c2126] text-2xl font-bold">Картка працівника</h1>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={handleEdit}
            className="bg-white border border-[#e5e8ed] h-10 flex items-center gap-2 px-4 rounded-lg text-[#1c2126] text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <span>✏</span>
            <span>Редагувати</span>
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="bg-white border border-red-200 h-10 flex items-center gap-2 px-4 rounded-lg text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
          >
            <span>🗑</span>
            <span>Видалити</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex gap-5 items-start">
        {/* Profile card */}
        <div className="bg-white border border-[#e5e8ed] rounded-2xl w-[342px] py-9 px-6 flex flex-col items-center">
          <div className="size-24 rounded-full bg-[#e5f7eb] flex items-center justify-center shrink-0">
            <span className="text-[#21ba6b] text-2xl font-semibold">{initials}</span>
          </div>
          <div className="text-[#1c2126] text-lg font-bold mt-4 mb-6">
            {employee.name}
          </div>

          <div className="flex flex-col gap-6 w-full">
            <div className="flex items-center gap-3">
              <span className="text-sm shrink-0">📅</span>
              <div className="flex flex-col gap-0.5">
                <span className="text-[#737a85] text-xs">Дата народження</span>
                <span className="text-[#1c2126] text-sm font-medium">
                  {employee.birthDate}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm shrink-0">📍</span>
              <div className="flex flex-col gap-0.5">
                <span className="text-[#737a85] text-xs">Місто</span>
                <span className="text-[#1c2126] text-sm font-medium">
                  {employee.city}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm shrink-0">🕓</span>
              <div className="flex flex-col gap-0.5">
                <span className="text-[#737a85] text-xs">Додано</span>
                <span className="text-[#1c2126] text-sm font-medium">
                  {employee.addedDate}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats card */}
        <div className="bg-white border border-[#e5e8ed] rounded-2xl w-[360px] p-6">
          <h2 className="text-[#1c2126] text-base font-semibold mb-6">Статистика</h2>
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <span className="text-[#737a85] text-sm">Заповнено днів</span>
              <span className="text-[#1c2126] text-base font-semibold">
                {stats.filledDays}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#737a85] text-sm">Вихідних днів</span>
              <span className="text-[#1c2126] text-base font-semibold">
                {stats.weekendDays}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#737a85] text-sm">Робочих днів</span>
              <span className="text-[#1c2126] text-base font-semibold">
                {stats.workedDays}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#737a85] text-sm">Останнє оновлення</span>
              <span className="text-[#1c2126] text-base font-semibold">
                {stats.lastUpdated}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeInfo;