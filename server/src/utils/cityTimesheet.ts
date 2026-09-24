import Employee from '../models/Employee';
import Timesheet from '../models/Timesheet';

export interface CityMonthRow {
  employeeId: string;
  fullName: string;
  hours: (number | null)[];
  totalHours: number;
}

// Зведений табель міста за місяць: години беруться з табелів, які мають
// саме цей cityId. Працівник може працювати і в інших місцях — там будуть
// його окремі години, вони сюди не потрапляють.
//
// У список входять:
//   - усі, хто має табель у цьому місті за цей місяць;
//   - «домашні» працівники міста (Employee.cityId), у яких за цей місяць
//     немає табеля взагалі ніде — щоб вони були видні з порожніми «x».
export const buildCityMonth = async (
  cityId: string,
  year: number,
  month: number
): Promise<CityMonthRow[]> => {
  const totalDays = new Date(year, month, 0).getDate();

  const cityTimesheets = await Timesheet.find({ cityId, year, month });
  const withSheetHere = new Set(cityTimesheets.map((t) => String(t.employeeId)));

  const homeEmployees = await Employee.find({ cityId });
  const homeWithoutHere = homeEmployees.filter((e) => !withSheetHere.has(String(e._id)));
  const homeIds = homeWithoutHere.map((e) => e._id);
  const elsewhere = homeIds.length
    ? await Timesheet.find({ employeeId: { $in: homeIds }, year, month }).select('employeeId')
    : [];
  const workedElsewhere = new Set(elsewhere.map((t) => String(t.employeeId)));

  const extraHome = homeWithoutHere.filter((e) => !workedElsewhere.has(String(e._id)));

  const sheetEmployees = await Employee.find({ _id: { $in: [...withSheetHere] } });
  const allEmployees = [...sheetEmployees, ...extraHome].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  const sheetByEmployee = new Map(cityTimesheets.map((t) => [String(t.employeeId), t]));

  return allEmployees.map((employee) => {
    const ts = sheetByEmployee.get(String(employee._id));
    const byDay = new Map((ts?.days || []).map((d) => [d.day, d]));
    const hours: (number | null)[] = Array.from({ length: totalDays }, (_, i) => {
      const h = byDay.get(i + 1)?.hours;
      return h === undefined ? null : h;
    });
    return {
      employeeId: String(employee._id),
      fullName: employee.fullName,
      hours,
      totalHours: hours.reduce<number>((sum, h) => sum + (h ?? 0), 0),
    };
  });
};
