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
