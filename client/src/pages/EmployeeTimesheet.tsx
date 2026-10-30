import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getTimesheet,
  updateTimesheet,
  getCities,
  getEmployee,
  getCityEmployees,
  listEmployeeTimesheets,
  TimesheetSummary,
} from '../api';
import { Timesheet, City, Employee } from '../types';
import TimesheetPhotoImport from '../components/TimesheetPhotoImport';

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

const MONTH_NAMES = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

const formatMoney = (value: number) =>
  value.toLocaleString('uk-UA', { maximumFractionDigits: 2 });

const selectClass =
  'bg-white border border-[#e5e8ed] h-10 px-3 rounded-lg w-full text-[#1c2126] text-sm outline-none focus:border-[#21ba6b]';

const WorkDaysForm = () => {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Місто (місце роботи), для якого редагуємо табель. Без нього — «домашнє»
  // місто працівника. Місяць/рік — ?year=&month=; без них відкриваємо
  // найновіший збережений табель (а якщо його нема — поточний місяць).
  const cityIdParam = searchParams.get('cityId') || undefined;
  const yearParam = Number(searchParams.get('year')) || undefined;
  const monthParam = Number(searchParams.get('month')) || undefined;

  const [currentDate] = useState(new Date());
  const year = yearParam ?? currentDate.getFullYear();
  const month = monthParam ?? currentDate.getMonth() + 1;

  const [days, setDays] = useState<DayEntry[]>(() => generateDays(year, month));
  const [quickFillHours, setQuickFillHours] = useState(11);
  // Ставка за годину як рядок з поля вводу ('' — не задана).
  const [rateInput, setRateInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [cityEmployees, setCityEmployees] = useState<Employee[]>([]);
  const [sheets, setSheets] = useState<TimesheetSummary[]>([]);
  // Табель можна вантажити лише коли визначено місто/місяць (див. перший ефект).
  const [ready, setReady] = useState(false);

  const cityId = cityIdParam ?? employee?.cityId;
  const cityName = cities.find((c) => c._id === cityId)?.name ?? '';
  const employeeName = employee?.fullName ?? '';

  // 1) Працівник, міста і список його табелів. Якщо місяць не задано в URL —
  //    відкриваємо найновіший збережений табель цього місця (або будь-якого
  //    місця, якщо місто теж не задано).
  useEffect(() => {
    if (!employeeId) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const [employeeRes, citiesRes, sheetsRes] = await Promise.all([
          getEmployee(employeeId),
          getCities(),
          listEmployeeTimesheets(employeeId),
        ]);
        if (cancelled) return;
        setEmployee(employeeRes.data);
        setCities(citiesRes.data);
        setSheets(sheetsRes.data);

        if (!yearParam || !monthParam) {
          const targetCity = cityIdParam ?? employeeRes.data.cityId;
          const latest =
            sheetsRes.data.find((s) => s.cityId === targetCity) ??
            (cityIdParam ? undefined : sheetsRes.data[0]);
          if (latest) {
            setSearchParams(
              { cityId: latest.cityId, year: String(latest.year), month: String(latest.month) },
              { replace: true }
            );
          }
        }
        setReady(true);
      } catch (error) {
        console.error('Failed to load employee:', error);
        alert('Помилка завантаження даних');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  // 2) Сам табель для обраних працівника + місця + місяця.
  const loadTimesheet = async (isCancelled: () => boolean = () => false) => {
    if (!employeeId || !cityId) return;
    setLoading(true);
    try {
      const { data } = await getTimesheet(employeeId, year, month, cityId);
      if (isCancelled()) return;
      const fetchedDays = (data.days ?? []) as Array<{ day: number; hours?: number | null }>;
      setDays(
        generateDays(year, month).map((entry) => {
          const match = fetchedDays.find((fd) => fd.day === entry.day);
          return match && match.hours !== undefined ? { ...entry, hours: match.hours } : entry;
        })
      );
      // Якщо для цього місяця ставку ще не задано — підставляємо останню відому
      // (спершу з цього ж місця, потім з будь-якого).
      const withRate = sheets.filter((s) => s.hourlyRate != null);
      const rate =
        data.hourlyRate ??
        withRate.find((s) => s.cityId === cityId)?.hourlyRate ??
        withRate[0]?.hourlyRate ??
        null;
      setRateInput(rate == null ? '' : String(rate));
      setDirty(false);
    } catch (error) {
      console.error('Failed to load timesheet:', error);
      alert('Помилка завантаження табеля');
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    loadTimesheet(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, employeeId, cityId, year, month]);

  // 3) Працівники обраного місця — для швидкого перемикання між ними.
  useEffect(() => {
    if (!cityId) return;
    let cancelled = false;
    getCityEmployees(cityId)
      .then(({ data }) => {
        if (!cancelled) setCityEmployees(data);
      })
      .catch((error) => console.error('Failed to load city employees:', error));
    return () => {
      cancelled = true;
    };
  }, [cityId]);

  // Поточний працівник завжди є у списку, навіть якщо в цьому місці він ще не працював.
  const employeeOptions = useMemo(() => {
    const list = [...cityEmployees].sort((a, b) => a.fullName.localeCompare(b.fullName));
    if (employee && !list.some((e) => e._id === employee._id)) list.unshift(employee);
    return list;
  }, [cityEmployees, employee]);

  const goTo = (next: { employeeId?: string; cityId?: string; year?: number; month?: number }) => {
    if (dirty && !window.confirm('Є незбережені зміни. Перейти без збереження?')) return;
    const params = new URLSearchParams({
      cityId: next.cityId ?? cityId ?? '',
      year: String(next.year ?? year),
      month: String(next.month ?? month),
    });
    navigate(`/employees/${next.employeeId ?? employeeId}/timesheet?${params}`, { replace: true });
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    goTo({ year: d.getFullYear(), month: d.getMonth() + 1 });
  };

  const yearOptions = useMemo(() => {
    const now = currentDate.getFullYear();
    const set = new Set<number>([year, ...sheets.map((s) => s.year)]);
    for (let y = now - 2; y <= now + 1; y++) set.add(y);
    return [...set].sort((a, b) => a - b);
  }, [sheets, year, currentDate]);

  const handlePhotoImported = () => {
    // Дані вже збережені в MongoDB на бекенді — просто перезавантажуємо форму,
    // щоб побачити розпізнані години.
    loadTimesheet();
    if (employeeId) listEmployeeTimesheets(employeeId).then(({ data }) => setSheets(data));
  };

  const selectedCount = useMemo(() => days.filter((d) => d.selected).length, [days]);

  const toggleSelect = (day: number) => {
    setDays((prev) =>
      prev.map((d) => (d.day === day ? { ...d, selected: !d.selected } : d))
    );
  };

  const setHours = (day: number, value: string) => {
    const parsed = value === '' ? null : Math.max(0, Math.min(24, Number(value)));
    setDirty(true);
    setDays((prev) =>
      prev.map((d) => (d.day === day ? { ...d, hours: parsed } : d))
    );
  };

  const copyToNextDay = (day: number) => {
    setDirty(true);
    setDays((prev) => {
      const current = prev.find((d) => d.day === day);
      if (!current) return prev;
      return prev.map((d) =>
        d.day === day + 1 ? { ...d, hours: current.hours } : d
      );
    });
  };

  const applyQuickFill = () => {
    setDirty(true);
    setDays((prev) =>
      prev.map((d) => (d.selected ? { ...d, hours: quickFillHours } : d))
    );
  };

  const totalHours = days.reduce((sum, d) => sum + (d.hours ?? 0), 0);
  const hourlyRate = rateInput.trim() === '' ? null : Number(rateInput.replace(',', '.'));
  const rateValid = hourlyRate === null || (Number.isFinite(hourlyRate) && hourlyRate >= 0);
  const earnings = hourlyRate !== null && rateValid ? totalHours * hourlyRate : null;

  const handleRateChange = (value: string) => {
    setDirty(true);
    setRateInput(value);
  };

  const handleSave = async () => {
    if (!employeeId) return;
    if (!rateValid) {
      alert('Некоректна ставка за годину');
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<Timesheet> = {
        days: days.map(({ day, hours }) => ({ day, hours })) as Timesheet['days'],
        hourlyRate,
      };
      await updateTimesheet(employeeId, year, month, payload, cityId);
      setDirty(false);
      navigate(-1);
    } catch (error) {
      console.error('Failed to save work days:', error);
      alert('Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  // On mobile everything stacks into a single column;
  // from md breakpoint up we split into two columns like on desktop.
  const half = Math.ceil(days.length / 2);
  const columns = [days.slice(0, half), days.slice(half)];

  const renderDayRow = (entry: DayEntry) => {
    const isWeekend = entry.weekday === 'Сб' || entry.weekday === 'Нд';
    const rowBg = entry.selected ? 'bg-[#e5f7eb]' : isWeekend ? 'bg-[#fbfbfc]' : 'bg-white';
    const hourBoxBorder = entry.selected ? 'border-[#21ba6b]' : 'border-[#e5e8ed]';

    return (
      <div
        key={entry.day}
        className={`flex gap-2 md:gap-2.5 h-9 items-center px-2 md:px-2.5 rounded-md ${rowBg}`}
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

        <div className="flex gap-2 md:gap-2.5 items-center text-[13px] w-[70px] md:w-[90px] shrink-0">
          <span className="font-medium text-[#1c2126]">{entry.day}</span>
          <span className="text-[#737a85]">{entry.weekday}</span>
        </div>

        <div className="flex-1 md:h-px md:bg-[#e5e8ed]" />

        <div
          className={`bg-white border ${hourBoxBorder} flex h-7 items-center justify-center rounded-md w-[64px] md:w-[74px] shrink-0`}
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
                inputMode="decimal"
                min={0}
                max={24}
                step={0.5}
                value={entry.hours}
                onChange={(e) => setHours(entry.day, e.target.value)}
                className="w-9 text-right bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              год
            </span>
          )}
        </div>

        {/* Copy-to-next-day button is hidden on the smallest screens to save
            horizontal space; still available from the sm breakpoint up. */}
        <button
          type="button"
          onClick={() => copyToNextDay(entry.day)}
          disabled={entry.day === days.length}
          className="hidden sm:flex bg-white border border-[#e5e8ed] h-7 items-center justify-center rounded-md shrink-0 w-7 text-[#737a85] text-xs disabled:opacity-30"
          title="Скопіювати години на наступний день"
        >
          ⧉
        </button>
      </div>
    );
  };

  // Повноекранне «Завантаження» лише при першому відкритті; при перемиканні
  // міста/місяця/працівника форма лишається на місці.
  if (!employee) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Завантаження...</div>
      </div>
    );
  }

  return (
    <div className="bg-[#fafafc] flex flex-col gap-4 md:gap-2 px-4 py-4 md:px-10 md:py-8">
      {/* Mobile header: back arrow + short title */}
      <div className="flex items-center gap-3 md:hidden">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Назад"
          className="text-[#1c2126] text-xl leading-none"
        >
          ←
        </button>
        <h1 className="text-[#1c2126] text-lg font-bold">Робочі дні</h1>
      </div>

      {/* Desktop header: breadcrumb + full title */}
      <div className="hidden md:block">
        <p className="text-[#737a85] text-xs truncate">
          Міста / {cityName || 'Завантаження...'} / {employeeName || 'Завантаження...'}
        </p>
        <h1 className="text-[#1c2126] text-2xl font-bold mt-2">
          Додати / Редагувати робочі дні
        </h1>
      </div>

      <div className="bg-white md:border md:border-[#e5e8ed] rounded-none md:rounded-2xl p-0 md:p-6 flex flex-col gap-4 md:gap-2.5 md:mt-4">
        {/* Top fields: stacked on mobile, in a row from md */}

        <div className="flex flex-col md:flex-row gap-3 md:gap-5 items-stretch md:items-start">
          <label className="flex flex-col gap-1.5 w-full md:w-[340px]">
            <span className="text-[#737a85] text-xs font-medium">Місто</span>
            <select
              value={cityId ?? ''}
              onChange={(e) => goTo({ cityId: e.target.value })}
              className={selectClass}
            >
              {cities.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1.5 w-full md:w-[340px]">
            <span className="text-[#737a85] text-xs font-medium">Дата (місяць)</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="shrink-0 bg-white border border-[#e5e8ed] h-10 w-10 rounded-lg text-[#737a85]"
                aria-label="Попередній місяць"
              >
                ‹
              </button>
              <select
                value={month}
                onChange={(e) => goTo({ month: Number(e.target.value) })}
                className={selectClass}
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => goTo({ year: Number(e.target.value) })}
                className={`${selectClass} !w-[88px] shrink-0`}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="shrink-0 bg-white border border-[#e5e8ed] h-10 w-10 rounded-lg text-[#737a85]"
                aria-label="Наступний місяць"
              >
                ›
              </button>
            </div>
          </div>
          <label className="flex flex-col gap-1.5 w-full md:w-[340px]">
            <span className="text-[#737a85] text-xs font-medium">Працівник</span>
            <select
              value={employeeId}
              onChange={(e) => goTo({ employeeId: e.target.value })}
              className={selectClass}
            >
              {employeeOptions.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.fullName}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Збережені табелі працівника в усіх місцях — перехід в один клік */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[#737a85] text-xs font-medium mr-1">Збережені табелі:</span>
          {sheets.length === 0 && <span className="text-[#737a85] text-xs">ще немає</span>}
          {sheets.map((s) => {
            const active = s.cityId === cityId && s.year === year && s.month === month;
            const sheetCity = cities.find((c) => c._id === s.cityId)?.name ?? '—';
            return (
              <button
                key={`${s.cityId}-${s.year}-${s.month}`}
                type="button"
                onClick={() => goTo({ cityId: s.cityId, year: s.year, month: s.month })}
                className={`h-7 px-2.5 rounded-md border text-xs whitespace-nowrap ${
                  active
                    ? 'bg-[#e5f7eb] border-[#21ba6b] text-[#1c2126] font-semibold'
                    : 'bg-white border-[#e5e8ed] text-[#737a85] hover:border-[#21ba6b]'
                }`}
              >
                {MONTH_NAMES[s.month - 1]} {s.year} · {sheetCity} · {s.totalHours} год
                {s.hourlyRate != null && ` · ${formatMoney(s.totalHours * s.hourlyRate)}`}
              </button>
            );
          })}
        </div>

        {/* Quick fill panel — mobile: compact row, count folded into the button label */}
        <div className="flex flex-col gap-2 md:hidden">
          <span className="text-[#1c2126] text-[13px] font-semibold flex items-center gap-1.5">
            <span className="text-[#21ba6b]">⚡</span> Швидке заповнення
          </span>
          <div className="flex gap-2.5 items-center">
            <div className="bg-white border border-[#e5e8ed] flex h-11 items-center px-3 rounded-lg w-[92px] shrink-0">
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
            <button
              type="button"
              onClick={applyQuickFill}
              disabled={selectedCount === 0}
              className="flex-1 bg-[#21ba6b] max-w-[180px] h-11 flex items-center justify-center rounded-lg text-white text-sm font-semibold disabled:opacity-40"
            >
              Застосувати (обрано {selectedCount})
            </button>
          </div>
        </div>

        {/* Quick fill panel — desktop: full descriptive version */}
        <div className="hidden md:flex bg-[#f2fcf5] border border-[#e5f7eb] gap-3 items-center px-4 py-3.5 rounded-xl">
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
            className="bg-[#21ba6b] flex h-10 items-center justify-center px-4 rounded-lg text-white text-[13px] font-semibold whitespace-nowrap disabled:opacity-40"
          >
            Застосувати до обраних
          </button>
        </div>

        {/* Mobile: short scroll hint instead of the copy-day legend */}
        <p className="md:hidden text-[11px] text-[#737a85] text-center">
          Прокрутіть вниз, щоб побачити решту днів місяця
        </p>

        {employeeId && (
          <TimesheetPhotoImport
            employeeId={employeeId}
            year={year}
            month={month}
            cityId={cityId}
            onImported={handlePhotoImported}
          />
        )}

        <h2 className="text-[#1c2126] text-sm font-semibold">
          Дні місяця <span className="text-[#737a85] font-medium">· разом {totalHours} год</span>
        </h2>

        {/* Day grid: single column on mobile, two columns from md */}
        <div
          className={`flex flex-col md:flex-row gap-4 md:gap-6 items-start transition-opacity ${
            loading ? 'opacity-40 pointer-events-none' : ''
          }`}
        >
          {columns.map((col, i) => (
            <div key={i} className="flex flex-col gap-1 flex-1 w-full">
              {col.map(renderDayRow)}
            </div>
          ))}
        </div>

        {/* Desktop: full copy-day legend */}
        <div className="hidden md:flex gap-2 items-center text-[#737a85]">
          <span className="text-xs">⧉</span>
          <span className="text-[11px]">
            — скопіювати години цього дня на наступний день. Позначте кілька днів чекбоксом, щоб задати години масово через панель вище.
          </span>
        </div>

        {/* Ставка і підсумок виплати за місяць */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 sm:items-end bg-[#f2fcf5] border border-[#e5f7eb] rounded-xl px-4 py-3.5">
          <label className="flex flex-col gap-1.5 sm:w-[180px]">
            <span className="text-[#737a85] text-xs font-medium">Ставка за годину</span>
            <input
              type="text"
              inputMode="decimal"
              value={rateInput}
              onChange={(e) => handleRateChange(e.target.value)}
              placeholder="0"
              className={`${selectClass} ${rateValid ? '' : '!border-red-400'}`}
            />
          </label>
          <div className="flex flex-col gap-0.5">
            <span className="text-[#737a85] text-xs font-medium">Годин за місяць</span>
            <span className="text-[#1c2126] text-base font-semibold h-10 flex items-center">
              {totalHours} год
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[#737a85] text-xs font-medium">Заробіток за місяць</span>
            <span className="text-[#21ba6b] text-xl font-bold h-10 flex items-center">
              {earnings === null ? '—' : formatMoney(earnings)}
            </span>
          </div>
          {earnings !== null && (
            <span className="text-[#737a85] text-xs sm:ml-auto sm:mb-3">
              {totalHours} год × {formatMoney(hourlyRate ?? 0)}
            </span>
          )}
        </div>

        {/* Actions: equal-width side-by-side buttons on mobile, fixed-width row on desktop */}
        <div className="flex flex-row gap-2.5 md:gap-7 md:justify-end">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 md:flex-none bg-white border border-[#e5e8ed] h-11 flex items-center justify-center rounded-[10px] md:w-[140px] text-[#737a85] text-sm font-semibold"
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 md:flex-none bg-[#21ba6b] h-11 flex items-center justify-center rounded-[10px] md:w-[140px] text-white text-sm font-semibold disabled:opacity-60"
          >
            {saving ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkDaysForm;