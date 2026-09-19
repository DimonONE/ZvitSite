import { Router } from 'express';
import multer from 'multer';
import { getCityEmployees } from '../controllers/employeeController';
import { getTimesheet, updateTimesheet, importTimesheetPhoto } from '../controllers/timesheetController';
import { exportTimesheetToExcel } from '../controllers/exportController';

const router = Router();

// Фото табеля потрібне лише на час запиту до AI — тримаємо в пам'яті,
// на диск не пишемо.
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/.test(file.mimetype);
    if (allowed) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  },
});

router.get('/:cityId/employees', getCityEmployees);
router.get('/:employeeId/timesheets/:year/:month', getTimesheet);
router.put('/:employeeId/timesheets/:year/:month', updateTimesheet);
router.get('/:employeeId/timesheets/:year/:month/export', exportTimesheetToExcel);
router.post(
  '/:employeeId/timesheets/:year/:month/import-photo',
  photoUpload.single('photo'),
  importTimesheetPhoto
);

export default router;
