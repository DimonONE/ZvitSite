import { Router } from 'express';
import { getCityEmployees } from '../controllers/employeeController';
import { getTimesheet, updateTimesheet } from '../controllers/timesheetController';
import { exportTimesheetToExcel } from '../controllers/exportController';

const router = Router();

router.get('/:cityId/employees', getCityEmployees);
router.get('/:employeeId/timesheets/:year/:month', getTimesheet);
router.put('/:employeeId/timesheets/:year/:month', updateTimesheet);
router.get('/:employeeId/timesheets/:year/:month/export', exportTimesheetToExcel);

export default router;
