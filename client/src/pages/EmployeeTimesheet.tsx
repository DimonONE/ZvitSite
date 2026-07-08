import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTimesheet, updateTimesheet } from '../api';
import { Timesheet } from '../types';

interface DayEntry {
  day: number;
  weekday: string;
  hours: number | null;
  selected: boolean;
}

const WEEKDAY_NAMES = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const generateDays = (year: number, month: number): DayEntry[] => {
  const daysInMonth = new Date(year, month, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = new Date(year, month - 1, day);
    const weekdayIndex = date.getDay();
    const isWeekend = weekdayIndex === 0 || weekdayIndex === 6;
    return {
      day,
      weekday: WEEKDAY_NAMES[weekdayIndex],
      hours: isWeekend ? null : 8,
      selected: false,
    };
  });
};

const WorkDaysForm = () => {
  const { cityId, employeeId } = useParams<{ cityId: string; employeeId: string }>();
  const navigate = useNavigate();

  const [currentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const [days, setDays] = useState<DayEntry[]>(() => generateDays(year, month));
  const [quickFillHours, setQuickFillHours] = useState(11);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTimesheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, year, month]);

  const loadTimesheet = async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await getTimesheet(employeeId, year, month);
      const fetchedDays = (response.data.days ?? []) as Array<{
        day: number;
        hours?: number | null;
      }>;

      setDays(
        generateDays(year, month).map((entry) => {
          const match = fetchedDays.find((fd) => fd.day === entry.day);
          return match && match.hours !== undefined
            ? { ...entry, hours: match.hours }
            : entry;
        })
      );
    } catch (error) {
      console.error('Failed to load timesheet:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = useMemo(() => days.filter((d) => d.selected).length, [days]);

  const toggleSelect = (day: number) => {
    setDays((prev) =>
      prev.map((d) => (d.day === day ? { ...d, selected: !d.selected } : d))
    );
  };

  const setHours = (day: number, value: string) => {
    const parsed = value === '' ? null : Math.max(0, Math.min(24, Number(value)));
    setDays((prev) =>
      prev.map((d) => (d.day === day ? { ...d, hours: parsed } : d))
    );
  };

  const copyToNextDay = (day: number) => {
    setDays((prev) => {
      const current = prev.find((d) => d.day === day);
      if (!current) return prev;
      return prev.map((d) =>
        d.day === day + 1 ? { ...d, hours: current.hours } : d
      );
    });
  };

  const applyQuickFill = () => {
    setDays((prev) =>
      prev.map((d) => (d.selected ? { ...d, hours: quickFillHours } : d))
    );
  };

  const getMonthName = (): string => {
    const monthNames = [
      'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
      'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
    ];
    return monthNames[month - 1];
  };

  const handleSave = async () => {
    if (!employeeId) return;
    setSaving(true);
    try {
      const payload: Partial<Timesheet> = {
        days: days.map(({ day, hours }) => ({ day, hours })) as Timesheet['days'],
      };
      await updateTimesheet(employeeId, year, month, payload);
      navigate(-1);
    } catch (error) {
      console.error('Failed to save work days:', error);
      alert('Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  const half = Math.ceil(days.length / 2);
  const columns = [days.slice(0, half), days.slice(half)];

  const renderDayRow = (entry: DayEntry) => {
    const isWeekend = entry.weekday === 'Сб' || entry.weekday === 'Нд';
    const rowBg = entry.selected ? 'bg-[#e5f7eb]' : isWeekend ? 'bg-[#fbfbfc]' : 'bg-white';
    const hourBoxBorder = entry.selected ? 'border-[#21ba6b]' : 'border-[#e5e8ed]';

    return (
      <div
        key={entry.day}
        className={`flex gap-2.5 h-9 items-center px-2.5 rounded-md ${rowBg}`}
      >
        <button
          type="button"
          onClick={() => toggleSelect(entry.day)}
          className={`shrink-0 size-4 rounded flex items-center justify-center border ${
            entry.selected
              ? 'bg-[#21ba6b] border-[#21ba6b]'
              : 'bg-white border-[#e5e8ed]'
          }`}
          aria-label={`Вибрати день ${entry.day}`}
        >
          {entry.selected && <span className="text-white text-[10px] font-bold">✓</span>}
        </button>

        <div className="flex gap-2.5 items-center text-[13px] w-[90px] shrink-0">
          <span className="font-medium text-[#1c2126]">{entry.day}</span>
          <span className="text-[#737a85]">{entry.weekday}</span>
        </div>

        <div className="flex-1 h-px bg-[#e5e8ed]" />

        <div
          className={`bg-white border ${hourBoxBorder} flex h-7 items-center justify-center rounded-md w-[74px] shrink-0`}
        >
          {entry.hours === null ? (
            <button
              type="button"
              onClick={() => setHours(entry.day, '8')}
              className="text-[#737a85] text-xs font-semibold"
            >
              –
            </button>
          ) : (
            <span className="flex items-center gap-1 text-[#1c2126] text-xs font-semibold">
              <input
                type="number"
                min={0}
                max={24}
                value={entry.hours}
                onChange={(e) => setHours(entry.day, e.target.value)}
                className="w-6 text-right bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              год
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => copyToNextDay(entry.day)}
          disabled={entry.day === days.length}
          className="bg-white border border-[#e5e8ed] flex h-7 items-center justify-center rounded-md shrink-0 w-7 text-[#737a85] text-xs disabled:opacity-30"
          title="Скопіювати години на наступний день"
        >
          ⧉
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Завантаження...</div>
      </div>
    );
  }

  return (
    <div className="bg-[#fafafc] flex flex-col gap-2 px-10 py-8">
      <p className="text-[#737a85] text-xs">Міста / Київ / Іван Петренко</p>
      <h1 className="text-[#1c2126] text-2xl font-bold">Додати / Редагувати робочі дні</h1>

      <div className="bg-white border border-[#e5e8ed] rounded-2xl p-6 flex flex-col gap-2.5 mt-4">
        {/* Top fields */}
        <div className="flex gap-5 items-start">
          <div className="flex flex-col gap-1.5">
            <span className="text-[#737a85] text-xs font-medium">Місто</span>
            <div className="bg-[#fafafc] border border-[#e5e8ed] h-10 flex items-center px-3 rounded-lg w-[340px]">
              <span className="text-[#1c2126] text-sm">Київ</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 w-[340px]">
            <span className="text-[#737a85] text-xs font-medium">Дата (місяць)</span>
            <div className="bg-[#fafafc] border border-[#e5e8ed] h-10 flex items-center px-3 rounded-lg w-[340px]">
              <span className="text-[#1c2126] text-sm">{getMonthName()} {year}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 w-[340px]">
            <span className="text-[#737a85] text-xs font-medium">Працівник</span>
            <div className="bg-[#fafafc] border border-[#e5e8ed] h-10 flex items-center px-3 rounded-lg w-[340px]">
              <span className="text-[#1c2126] text-sm">Іван Петренко</span>
            </div>
          </div>
        </div>

        {/* Quick fill panel */}
        <div className="bg-[#f2fcf5] border border-[#e5f7eb] flex gap-3 items-center px-4 py-3.5 rounded-xl">
          <div className="bg-[#21ba6b] flex items-center justify-center rounded-lg shrink-0 size-9">
            <span className="text-white text-sm">⚡</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[#1c2126] text-[13px] font-semibold">Швидке заповнення</span>
            <span className="text-[#737a85] text-[11px]">
              Виберіть дні внизу, задайте години і застосуйте одразу до всіх
            </span>
          </div>
          <div className="flex-1" />
          <div className="bg-white border border-[#e5e8ed] flex h-10 items-center px-3 rounded-lg w-[90px]">
            <input
              type="number"
              min={0}
              max={24}
              value={quickFillHours}
              onChange={(e) => setQuickFillHours(Number(e.target.value))}
              className="w-8 bg-transparent outline-none text-[#1c2126] text-[13px] font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-[#1c2126] text-[13px] font-semibold">год</span>
          </div>
          <div className="bg-white border border-[#e5e8ed] flex h-10 items-center justify-center px-3.5 rounded-lg whitespace-nowrap">
            <span className="text-[#737a85] text-xs font-medium">Обрано: {selectedCount} днів</span>
          </div>
          <button
            type="button"
            onClick={applyQuickFill}
            disabled={selectedCount === 0}
            className="bg-[#21ba6b] flex h-10 items-center justify-center px-4.5 rounded-lg text-white text-[13px] font-semibold whitespace-nowrap disabled:opacity-40"
          >
            Застосувати до обраних
          </button>
        </div>

        <h2 className="text-[#1c2126] text-sm font-semibold">Дні місяця</h2>

        {/* Day grid */}
        <div className="flex gap-6 items-start">
          {columns.map((col, i) => (
            <div key={i} className="flex flex-col gap-1 flex-1">
              {col.map(renderDayRow)}
            </div>
          ))}
        </div>

        <div className="flex gap-2 items-center text-[#737a85]">
          <span className="text-xs">⧉</span>
          <span className="text-[11px]">
            — скопіювати години цього дня на наступний день. Позначте кілька днів чекбоксом, щоб задати години масово через панель вище.
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-7 justify-end">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="bg-white border border-[#e5e8ed] h-11 flex items-center justify-center rounded-[10px] w-[140px] text-[#737a85] text-sm font-semibold"
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-[#21ba6b] h-11 flex items-center justify-center rounded-[10px] w-[140px] text-white text-sm font-semibold disabled:opacity-60"
          >
            {saving ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkDaysForm;