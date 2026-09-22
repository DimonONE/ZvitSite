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
export const getTimesheet = (employeeId: string, year: number, month: number) =>
  api.get<Timesheet>(`/employees/${employeeId}/timesheets/${year}/${month}`);
export const updateTimesheet = (employeeId: string, year: number, month: number, data: Partial<Timesheet>) =>
  api.put<Timesheet>(`/employees/${employeeId}/timesheets/${year}/${month}`, data);
export const exportTimesheet = (employeeId: string, year: number, month: number) =>
  api.get(`/employees/${employeeId}/timesheets/${year}/${month}/export`, { responseType: 'blob' });
export const importTimesheetPhoto = (employeeId: string, year: number, month: number, file: File) => {
  const formData = new FormData();
  formData.append('photo', file);
  return api.post<Timesheet>(
    `/employees/${employeeId}/timesheets/${year}/${month}/import-photo`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
};

export interface CitySheetImportResult {
  year: number;
  month: number;
  detectedCityName: string | null;
  resolvedCity: { _id: string; name: string } | null;
  matched: Array<{ employeeId: string; employeeName: string; totalHours: number }>;
  unmatched: Array<{ recognizedName: string; hours: (number | null)[] }>;
}

// Завантаження фото зведеного табеля по місту (без вибору працівника —
// AI сам розпізнає всіх зі знімку і зіставляє з базою).
export const importCitySheetPhoto = (
  file: File,
  options?: { cityId?: string; year?: number; month?: number }
) => {
  const formData = new FormData();
  formData.append('photo', file);
  if (options?.cityId) formData.append('cityId', options.cityId);
  if (options?.year) formData.append('year', String(options.year));
  if (options?.month) formData.append('month', String(options.month));
  return api.post<CitySheetImportResult>('/cities/import-city-sheet-photo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const exportCityMonth = (cityId: string, year: number, month: number) =>
  api.get(`/cities/${cityId}/city-timesheet/${year}/${month}/export`, { responseType: 'blob' });
