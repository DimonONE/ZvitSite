import axios from 'axios';
import { City, Employee, Timesheet } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Cities
export const getCities = () => api.get<City[]>('/cities');
export const createCity = (name: string) => api.post<City>('/cities', { name });
export const updateCity = (id: string, name: string) => api.patch<City>(`/cities/${id}`, { name });
export const deleteCity = (id: string) => api.delete(`/cities/${id}`);

// Employees
export const getCityEmployees = (cityId: string) => api.get<Employee[]>(`/cities/${cityId}/employees`);
export const getEmployee = (id: string) => api.get<Employee>(`/employees/${id}`);
export const createEmployee = (data: Partial<Employee>) => api.post<Employee>('/employees', data);
export const updateEmployee = (id: string, data: Partial<Employee>) => api.patch<Employee>(`/employees/${id}`, data);
export const deleteEmployee = (id: string) => api.delete(`/employees/${id}`);
export const uploadEmployeePhoto = (id: string, file: File) => {
  const formData = new FormData();
  formData.append('photo', file);
  return api.post<{ photoUrl: string }>(`/employees/${id}/photo`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// Timesheets
// Табель належить парі «працівник + місто» (працівник може працювати в кількох
// місцях). cityId необов'язковий: без нього сервер бере «домашнє» місто працівника.
const cityQuery = (cityId?: string) => (cityId ? { params: { cityId } } : {});

export const getTimesheet = (employeeId: string, year: number, month: number, cityId?: string) =>
  api.get<Timesheet>(`/employees/${employeeId}/timesheets/${year}/${month}`, cityQuery(cityId));
export const updateTimesheet = (
  employeeId: string,
  year: number,
  month: number,
  data: Partial<Timesheet>,
  cityId?: string
) => api.put<Timesheet>(`/employees/${employeeId}/timesheets/${year}/${month}`, data, cityQuery(cityId));
export const exportTimesheet = (employeeId: string, year: number, month: number, cityId?: string) =>
  api.get(`/employees/${employeeId}/timesheets/${year}/${month}/export`, {
    responseType: 'blob',
    ...cityQuery(cityId),
  });
export const importTimesheetPhoto = (
  employeeId: string,
  year: number,
  month: number,
  file: File,
  cityId?: string
) => {
  const formData = new FormData();
  formData.append('photo', file);
  return api.post<Timesheet>(
    `/employees/${employeeId}/timesheets/${year}/${month}/import-photo`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' }, ...cityQuery(cityId) }
  );
};

export interface CityMonthRow {
  employeeId: string;
  fullName: string;
  hours: (number | null)[];
  totalHours: number;
}

export interface CityMonthResult {
  cityId: string;
  cityName: string;
  year: number;
  month: number;
  rows: CityMonthRow[];
}

// Зведений табель міста за місяць (години саме з цього міста).
export const getCityMonth = (cityId: string, year: number, month: number) =>
  api.get<CityMonthResult>(`/cities/${cityId}/city-timesheet/${year}/${month}`);

export interface CitySheetRow {
  recognizedName: string;
  hours: (number | null)[];
  totalHours: number;
  // підсумок з фото (колонка «Hod. celkem»), для звірки; null — не розпізнано
  photoTotal: number | null;
  matchedEmployeeId: string | null;
  matchedEmployeeName: string | null;
}

export interface CitySheetPreviewResult {
  year: number;
  month: number;
  totalDays: number;
  detectedCityName: string | null;
  resolvedCity: { _id: string; name: string } | null;
  rows: CitySheetRow[];
}

export interface CitySheetConfirmRow {
  recognizedName: string;
  hours: (number | null)[];
  // employeeId: прив'язати до існуючого працівника; відсутнє/null — створити нового
  employeeId?: string | null;
  // skip: не імпортувати цей рядок узагалі
  skip?: boolean;
}

export interface CitySheetConfirmResult {
  year: number;
  month: number;
  cityId: string;
  cityName: string;
  cityCreated: boolean;
  saved: Array<{ employeeId: string; employeeName: string; totalHours: number; created: boolean }>;
  skipped: number;
}

// Крок 1 — тільки розпізнати фото зведеного табеля по місту і повернути
// прев'ю (точно в тому вигляді, в якому воно піде в базу/Excel). У базу
// НІЧОГО не пишеться, поки користувач не підтвердить прев'ю (див. нижче).
export const previewCitySheetPhoto = (
  file: File,
  options?: { cityId?: string; year?: number; month?: number }
) => {
  const formData = new FormData();
  formData.append('photo', file);
  if (options?.cityId) formData.append('cityId', options.cityId);
  if (options?.year) formData.append('year', String(options.year));
  if (options?.month) formData.append('month', String(options.month));
  return api.post<CitySheetPreviewResult>('/cities/import-city-sheet-photo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// Крок 2 — користувач підтвердив прев'ю: тільки тепер створюємо
// працівників, яких не було в базі, і зберігаємо табель за місяць.
export const confirmCitySheetImport = (data: {
  year: number;
  month: number;
  // Місто завжди береться з розпізнаного фото (можна лише виправити текст
  // в прев'ю) — не обирається зі списку. Якщо такого місця ще нема в базі,
  // воно буде створене автоматично.
  cityName: string;
  rows: CitySheetConfirmRow[];
}) => api.post<CitySheetConfirmResult>('/cities/import-city-sheet-photo/confirm', data);

export const exportCityMonth = (cityId: string, year: number, month: number) =>
  api.get(`/cities/${cityId}/city-timesheet/${year}/${month}/export`, { responseType: 'blob' });